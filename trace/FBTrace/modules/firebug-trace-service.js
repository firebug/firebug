/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const EXTENSIONS = "extensions";
const DBG_ = "DBG_";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var EXPORTED_SYMBOLS = ["traceConsoleService"];

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch);
const prefService = PrefService.getService(Ci.nsIPrefService);
const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
const appShellService = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService);
const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

// ************************************************************************************************
// Service implementation

var toOSConsole = false;
var toLogFile = false;

var traceConsoleService =
{
    initialize: function()
    {
        this.observers = [];
        this.optionMaps = {};

        // Listen for preferences changes. Trace Options can be changed at run time.
        prefs.addObserver("extensions", this, false);

        if (toLogFile)
        {
            this.file = dirService.get("ProfD", Ci.nsIFile);
            this.file.append("firebug");
            this.file.append("fbtrace");
            this.file.append("lastlog.ftl");
            //this.file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
        }

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
        if (!prefDomain)
            traceConsoleService.osOut("firebug-trace-service getTracer ERROR no prefDomain "+getStackDump());

        if (this.getPref("extensions.firebug-tracing-service.DBG_toOSConsole"))
        {
             toOSConsole = true;  // also need browser.dom.window.dump.enabled true
             traceConsoleService.osOut("traceConsoleService.getTracer, prefDomain: "+prefDomain+"\n");
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
                //if (toOSConsole)
                //    this.osOut("traceConsoleService.createManagedOptionMap "+optionName+"="+optionMap[optionName]+"\n");
            }
        }

        return optionMap;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        if (data.substr(0,EXTENSIONS.length) == EXTENSIONS)
        {
            for (var prefDomain in traceConsoleService.optionMaps)
            {
                if (data.substr(0, prefDomain.length) == prefDomain)
                {
                    var optionName = data.substr(prefDomain.length+1); // skip dot
                    if (optionName.substr(0, DBG_.length) == DBG_)
                        traceConsoleService.optionMaps[prefDomain][optionName] = this.getPref(data);
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
    dispatch: function(messageType, message, obj)
    {
        // Translate string object.
        if (typeof(obj) == "string") {
            var string = Cc["@mozilla.org/supports-cstring;1"].createInstance(Ci.nsISupportsCString);
            string.data = obj;
            obj = string;
        }

        message = message +"";    // make sure message is a string

        // Create wrapper with message type info.
        var messageInfo = {
            obj: obj,
            type: messageType,
            time: (new Date()).getTime()
        };

        var text;
        if (toOSConsole || toLogFile)
        {
            text = messageType + ": " + message + "\n";
            if (obj && "stack" in obj)
            {
                var stack = obj['stack'];
                text += stack + ": " + stack + "\n";
            }
        }

        if (toOSConsole)
            traceConsoleService.osOut(text);

        if (toLogFile)
            writeTextToFile(this.file, text);

        // Pass JS object properly through XPConnect.
        var wrappedSubject = {wrappedJSObject: messageInfo};
        traceConsoleService.notifyObservers(wrappedSubject, "firebug-trace-on-message", message);
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

    traceConsoleService.osOut("FTS"+listeners.length+": "+someData+" "+objPart+"\n");
}

// ************************************************************************************************
// Public TraceService API

var TraceAPI =
{
    dump: function(messageType, message, obj)
    {
        if (this.noTrace)
            return;

        this.noTrace = true;
        try
        {
            traceConsoleService.dispatch(messageType, message, obj);
        }
        catch(exc)
        {
        }
        finally
        {
            this.noTrace = false;
        }
    },

    sysout: function(message, obj)
    {
        this.dump("no-message-type", message, obj);
    },

    matchesNode: function(node)
    {
        return (node.getAttribute('anonid')=="title-box");
    },

    time: function(name, reset)
    {
        if (!name)
            return;

        var time = new Date().getTime();

        if (!this.timeCounters)
            this.timeCounters = {};

        var key = "KEY"+name.toString();

        if (!reset && this.timeCounters[key])
            return;

        this.timeCounters[key] = time;
    },

    timeEnd: function(name)
    {
        var time = new Date().getTime();

        if (!this.timeCounters)
            return;

        var key = "KEY"+name.toString();

        var timeCounter = this.timeCounters[key];
        if (timeCounter)
        {
            var diff = time - timeCounter;
            var label = name + ": " + diff + "ms";

            this.sysout(label);

            delete this.timeCounters[key];
        }

        return diff;
    }
};

// ************************************************************************************************

var TraceBase = function(prefDomain)
{
    this.prefDomain = prefDomain;
}

//Derive all properties from TraceAPI
for (var p in TraceAPI)
    TraceBase.prototype[p] = TraceAPI[p];

TraceBase.prototype.sysout = function(message, obj)
{
    if (this.noTrace)
        return;

    this.noTrace = true;

    try
    {
        traceConsoleService.dispatch(this.prefDomain, message, obj);
    }
    catch(exc)
    {
        if (toOSConsole)
            traceConsoleService.osOut("traceConsoleService.dispatch FAILS " + exc + "\n");
    }
    finally
    {
        this.noTrace = false;
    }
}

// ************************************************************************************************

function getStackDump()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

// ************************************************************************************************

function writeTextToFile(file, string)
{
    try
    {
        // Initialize output stream.
        var outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Ci.nsIFileOutputStream);
        outputStream.init(file, 0x02 | 0x10, 0666, 0); // write, create, truncate

        var converter = Cc["@mozilla.org/intl/converter-output-stream;1"]
            .createInstance(Ci.nsIConverterOutputStream);

        converter.init(outputStream, "UTF-8", 0, 0);
        converter.writeString("- " + string);

        var stack = getStackDump();
        converter.writeString(stack + "\n\n");

        // this closes foStream
        converter.close();
    }
    catch (err)
    {
    }
}

// ************************************************************************************************

traceConsoleService.initialize();

// ************************************************************************************************
