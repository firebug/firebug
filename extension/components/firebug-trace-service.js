/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{D2AC51BC-1622-4d4d-85CB-F8E8B5805CB9}");
const CLASS_NAME = "Firebug Trace Console Service";
const CONTRACT_ID = "@joehewitt.com/firebug-trace-service;1";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);
const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

const appShellService = Components.classes["@mozilla.org/appshell/appShellService;1"].getService(Components.interfaces.nsIAppShellService);                       /*@explore*/

// ************************************************************************************************
// Service implementation

function TraceConsoleService()
{
    this.wrappedJSObject = FBTrace;
    this.observers = [];

    // Initialize options of FBTrace object according to the preferences.
    this.initializeOptions();

    // Listen for preferences changes. Trace Options can be changed at run time.
    prefs.addObserver("extensions", this, false);
}

TraceConsoleService.prototype = 
{
    initializeOptions: function()
    {
        var allPrefs = prefs.getChildList("extensions", {});
        for (var i = 0; i < allPrefs.length; i++)
        {
            var prefName = allPrefs[i];
            if (this.isFirebugTracePref(prefName))
            {
                var optionName = prefName.substr(prefName.lastIndexOf(".")+1);
                FBTrace[optionName] = this.getPref(prefName);
                
                //dump("FBTrace[" + optionName + "]=>" + FBTrace[optionName] + "\n");
            }
        }
    },

    // Prepare trace-object and dispatch to all observers.
    dispatch: function(messageType, message, obj)
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
            type: messageType
        };

        // Pass JS object properly through XPConnect.
        var wrappedSubject = {wrappedJSObject: messageInfo};
        gTraceService.notifyObservers(wrappedSubject, "firebug-trace-on-message", message);
    },

    isFirebugTracePref: function(prefName)
    {
        return (prefName.indexOf("extensions.firebug.DBG_") == 0 ||
            prefName.indexOf("extensions.firebug-service.") == 0);
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

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        // Preferences for FBTrace begins with extensions.firebug.DBG_ or 
        // extensions.firebug-service.DBG_
        if (this.isFirebugTracePref(data))
        {
            var optionName = data.substr(data.lastIndexOf(".")+1);
            FBTrace[optionName] = this.getPref(data);

            //dump("TraceConsoleService.observe, FBTrace[" + optionName + "] => " 
            //    + FBTrace[optionName] + "\n");
        }
    },

    /* nsIObserverService */
    addObserver: function(observer, topic, weak)
    {
        if (topic != "firebug-trace-on-message")
            throw Cr.NS_ERROR_INVALID_ARG;
    
        this.observers.push(observer);
    },

    removeObserver: function(observer, topic)
    {
        if (topic != "firebug-trace-on-message")
            throw Cr.NS_ERROR_INVALID_ARG;

        for (var i=0; this.observers.length; i++) {
            if (this.observers[i] == observer) {
                this.observers.splice(i, 1);
                break;
            }
        }
    },

    notifyObservers: function(subject, topic, someData)
    {
        try
        {
            if (this.observers.length > 0)
            {
                for (var i=0; i<this.observers.length; i++)
                    this.observers[i].observe(subject, topic, someData);
            }
            else
            {
                var hiddenWindow = appShellService.hiddenDOMWindow; 
                var unwrapped = subject.wrappedJSObject;
                var objPart = unwrapped.obj ? (" obj: "+unwrapped.obj) : "";
                hiddenWindow.dump("FTS: "+someData+objPart+"\n");
            }            
        }
        catch (err)
        {
            // If it's not possible to distribute the log through registered observers,
            // use Firefox ErrorConsole. Ulimately the trace-console listens for it
            // too and so, will display that.
            var scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
            scriptError.init("[JavaScript Error: Failed to notify firebug-trace observers!] " +
                err.toString(), "chrome://firebug/components/firebug-trace-service.js",
                err.sourceLine, err.lineNumber, err.columnNumber, err.flags, err.category);
            consoleService.logMessage(scriptError);
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

// ************************************************************************************************
// Public FBTrace API

var FBTrace = 
{    
    dump: function(messageType, message, obj) {
        gTraceService.dispatch(messageType, message, obj);
    },

    sysout: function(message, obj) {
        this.dump(null, message, obj);
    },

    // OBSOLETE
    dumpProperties: function(message, obj) {
        this.sysout(message, obj);
    },

    dumpStack: function(message) {
        this.sysout(message);
    },

    dumpEvent: function(message, eventObj) {
        this.sysout(message, eventObj);
    }
};

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
    		    gTraceService = new TraceConsoleService();
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
