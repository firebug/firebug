/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{D2AC51BC-1622-4d4d-85CB-F8E8B5805CB9}");
const CLASS_NAME = "Firebug Trace Console Service";
const CONTRACT_ID = "@joehewitt.com/firebug-trace-service;1";
const EXTENSIONS = "extensions";
const DBG_ = "DBG_";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch2);
const prefService = PrefService.getService(Ci.nsIPrefService);
const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

const appShellService = Components.classes["@mozilla.org/appshell/appShellService;1"].getService(Components.interfaces.nsIAppShellService);

// ************************************************************************************************
// Service implementation


var toOSConsole = false;

TraceConsoleService =
{
    initialize: function() {
        this.observers = [];
        this.optionMaps = {};

        // Listen for preferences changes. Trace Options can be changed at run time.
        prefs.addObserver("extensions", this, false);

        this.wrappedJSObject = this;
        return this;
    },

    osOut: function(str)
    {
        if (!this.outChannel)
        {
            try
            {
                var appShellService = Components.classes["@mozilla.org/appshell/appShellService;1"].
                    getService(Components.interfaces.nsIAppShellService);
                this.hiddenWindow = appShellService.hiddenDOMWindow;
                this.outChannel = "hidden";
            }
            catch(exc)
            {
                var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
                this.outChannel = "service"
                this.outChannel("Using consoleService because nsIAppShellService.hiddenDOMWindow not available "+exc);
            }
        }
        if (this.outChannel === "hidden")  // apparently can't call via JS function
            this.hiddenWindow.dump(str);
        else
            consoleService.logStringMessage(str);
    },

    getTracer: function(prefDomain)
    {
        if (this.getPref("extensions.firebug-tracing-service.DBG_toOSConsole"))
        {
             toOSConsole = true;  // also need browser.dom.window.dump.enabled true
             TraceConsoleService.osOut("TraceConsoleService.getTracer, prefDomain: "+prefDomain+"\n");
        }

        if (!this.optionMaps[prefDomain])
            this.optionMaps[prefDomain] = this.createManagedOptionMap(prefDomain);

        return this.optionMaps[prefDomain];
    },

    createManagedOptionMap: function(prefDomain)
    {
        var optionMap = new TraceBase(prefDomain);

        var branch = prefService.getBranch ( prefDomain );
        var arrayDesc = {};
        var children = branch.getChildList("", arrayDesc);
        for (var i = 0; i < children.length; i++)
        {
            var p = children[i];
            var m = p.indexOf("DBG_");
            if (m != -1)
            {
                var optionName = p.substr(1); // drop leading .
                optionMap[optionName] = this.getPref(prefDomain+p);
                if (toOSConsole)
                    this.osOut("TraceConsoleService.createManagedOptionMap "+optionName+"="+optionMap[optionName]+"\n");
            }
        }

        return optionMap;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        if (data.substr(0,EXTENSIONS.length) == EXTENSIONS)
        {
            for (var prefDomain in gTraceService.optionMaps)
            {
                if (data.substr(0, prefDomain.length) == prefDomain)
                {
                    var optionName = data.substr(prefDomain.length+1); // skip dot
                    if (optionName.substr(0, DBG_.length) == DBG_)
                        gTraceService.optionMaps[prefDomain][optionName] = this.getPref(data);
                    if (toOSConsole)
                        TraceConsoleService.osOut("TraceConsoleService.observe, prefDomain: "+prefDomain+" optionName "+optionName+"\n");
                }
            }
        }
    },

    getPref: function(prefName)
    {
        var type = prefs.getPrefType(prefName);
        if (type == Ci.nsIPrefBranch.PREF_STRING)
            return prefs.getCharPref(prefName);
        else if (type == Ci.nsIPrefBranch.PREF_INT)
            return prefs.getIntPref(prefName);
        else if (type == Ci.nsIPrefBranch.PREF_BOOL)
            return prefs.getBoolPref(prefName);
    },

    // Prepare trace-object and dispatch to all observers.
    dispatch: function(messageType, message, obj, scope)
    {
        // Translate string object.
        if (typeof(obj) == "string") {
            var string = Cc["@mozilla.org/supports-cstring;1"].createInstance(Ci.nsISupportsCString);
            string.data = obj;
            obj = string;
        }

        // Create wrapper with message type info.
        var messageInfo = {
            obj: obj,
            type: messageType,
            scope: scope,
            time: (new Date()).getTime()
        };
        if (toOSConsole)
            TraceConsoleService.osOut(messageType+": "+message+"\n");
        // Pass JS object properly through XPConnect.
        var wrappedSubject = {wrappedJSObject: messageInfo};
        gTraceService.notifyObservers(wrappedSubject, "firebug-trace-on-message", message);
    },

    /* nsIObserverService */
    addObserver: function(observer, topic, weak)
    {
        if (topic != "firebug-trace-on-message")
            throw Cr.NS_ERROR_INVALID_ARG;

        if (this.observers.length == 0) // mark where trace begins.
            lastResort(this.observers, topic, "addObserver");

        this.observers.push(observer);
    },

    removeObserver: function(observer, topic)
    {
        if (topic != "firebug-trace-on-message")
            throw Cr.NS_ERROR_INVALID_ARG;

        for (var i=0; i < this.observers.length; i++) {
            if (this.observers[i] == observer) {
                this.observers.splice(i, 1);
                break;
            }
        }
    },

    notifyObservers: function(subject, topic, someData)
    {
        if (this.observers.length > 0)
        {
            for (var i=0; i < this.observers.length; i++)
            {
                try
                {
                    this.observers[i].observe(subject, topic, someData);
                }
                catch (err)
                {
                    // If it's not possible to distribute the log through registered observers,
                    // use Firefox ErrorConsole. Ultimately the trace-console listens for it
                    // too and so, will display that.
                    var scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
                    scriptError.init("[JavaScript Error: Failed to notify firebug-trace observers!] " +
                        err.toString(), err.sourceName,
                        err.sourceLine, err.lineNumber, err.columnNumber, err.flags, err.category);
                    consoleService.logMessage(scriptError);
                }
            }
        }
        else
        {
            lastResort(this.observers, subject, someData);
        }
    },

    enumerateObservers: function(topic)
    {
        return null;
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserverService))
             return this;

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
};

function lastResort(listeners, subject, someData)
{
    var unwrapped = subject.wrappedJSObject;
    if (unwrapped)
        var objPart = unwrapped.obj ? (" obj: "+unwrapped.obj) : "";
    else
        var objPart = subject;

    TraceConsoleService.osOut("FTS"+listeners.length+": "+someData+" "+objPart+"\n");
}
// ************************************************************************************************
// Public TraceService API

// Prevent tracing from code that performs tracing.
var noTrace = false;

var TraceAPI = {
    dump: function(messageType, message, obj) {
        if (noTrace)
            return;

        noTrace = true;
        try
        {
            gTraceService.dispatch(messageType, message, obj);
        }
        catch(exc)
        {
        }
        finally
        {
            noTrace = false;
        }
    },

    sysout: function(message, obj) {
        this.dump(null, message, obj);
    },

    setScope: function(scope)
    {
        this.scopeOfFBTrace = scope;
    },

    matchesNode: function(node)
    {
        return (node.getAttribute('anonid')=="title-box");
    },

};

var TraceBase = function(prefDomain) {
    this.prefDomain = prefDomain;
}
//Derive all properties from TraceAPI
for (var p in TraceAPI)
    TraceBase.prototype[p] = TraceAPI[p];

TraceBase.prototype.sysout = function(message, obj) {
        if (noTrace)
            return;

        noTrace = true;

        try
        {
            gTraceService.dispatch(this.prefDomain, message, obj, this.scopeOfFBTrace);
        }
        catch(exc)
        {
            if (toOSConsole)
                TraceConsoleService.osOut("gTraceService.dispatch FAILS "+exc);
        }
        finally
        {
            noTrace = false;
        }
}




// ************************************************************************************************
// Service factory

var gTraceService = null;
var TraceConsoleServiceFactory =
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserverService))
        {
            if (!gTraceService)
                gTraceService = TraceConsoleService.initialize();

            return gTraceService.QueryInterface(iid);
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsIFactory))
            return this;

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
};

// ************************************************************************************************
// Module implementation

var TraceConsoleServiceModule =
{
    registerSelf: function (compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME,
            CONTRACT_ID, fileSpec, location, type);
    },

    unregisterSelf: function(compMgr, fileSpec, location)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.unregisterFactoryLocation(CLASS_ID, location);
    },

    getClassObject: function (compMgr, cid, iid)
    {
        if (!iid.equals(Ci.nsIFactory))
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;

        if (cid.equals(CLASS_ID))
            return TraceConsoleServiceFactory;

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    canUnload: function(compMgr)
    {
        return true;
    }
};

// ************************************************************************************************

function NSGetModule(compMgr, fileSpec)
{
    return TraceConsoleServiceModule;
}
