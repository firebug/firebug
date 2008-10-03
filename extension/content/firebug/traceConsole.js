/* See license.txt for terms of usage */

// ************************************************************************************************
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;

const traceService = Cc["@joehewitt.com/firebug-trace-service;1"].getService(Ci.nsIObserverService);
const hiddenWindow = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService).hiddenDOMWindow;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch2);
const prefService = PrefService.getService(Ci.nsIPrefService);

var gFindBar;

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;

// The lib.js isn't included in this window so, define the global here.
var FBL;

// ************************************************************************************************
// Trace Window Implementation

var TraceConsole =
{
    modules: [],

    initialize: function()  
    {
        var args = window.arguments[0];
        FBL = args.FBL;
        Firebug = args.Firebug; 

        // Get pref domain is used for message filtering. Only logs that belong
        // to this pref-domain will be displayed.
        this.prefDomain = args.prefDomain; 
        window.title = "Firebug Tracing: " + this.prefDomain;

        // Initialize root node of the trace-console window.
        var consoleFrame = document.getElementById("consoleFrame");
        this.consoleNode = consoleFrame.contentDocument.getElementById("panelNode-traceConsole");
        this.logs = Firebug.TraceModule.initializeContent(this.consoleNode, this.prefDomain);

        // Register listeners and observers
        traceService.addObserver(this, "firebug-trace-on-message", false);
        prefs.addObserver("extensions", this, false);

        gFindBar = document.getElementById("FindToolbar");

        // Notify listeners
        Firebug.TraceModule.onLoadConsole(window, this.consoleNode);
        this.registerModule(Firebug.TraceModule);
    },

    shutdown: function()
    {
        prefs.removeObserver("extensions", this, false);
        traceService.removeObserver(this, "firebug-trace-on-message");

        // Notify listeners
        for (var i=0; i<this.modules.length; ++i)
            this.modules[i].onUnloadConsole(window);
    },

    registerModule: function(traceModule)
    {
        this.modules.push(traceModule);
    },

    unregisterModule: function(module)
    {
        for (var i=0; i<this.modules.length; ++i) {
            if (this.modules[i] == item) {
                this.modules.splice(i, 1);
                break;
            }
        }
    },

    // nsIObserver
    observe: function(subject, topic, data)
    {
        if (topic == "firebug-trace-on-message")
        {
            // Display messages only with "firebug.extensions" type.
            var messageInfo = subject.wrappedJSObject;

            // If the message type isn't specified, use Firebug's pref domain as the default.
            if (!messageInfo.type)
                messageInfo.type = "extensions.firebug";

            if (messageInfo.type != this.prefDomain)
                return;

            this.dump(new Firebug.TraceModule.TraceMessage(
                messageInfo.type, data, messageInfo.obj));
        }
        else if (topic == "nsPref:changed")
        {
            // xxxHonza
            // traceConsole can't use the FBTrace object here as it can be different
            // from the FBTrace object in the Firebug chrome window
        }
    },

    // Message dump
    dump: function(message)
    {
        // Notify listeners
        for (var i=0; i<this.modules.length; ++i)
            this.modules[i].onDump(message);

        Firebug.TraceModule.dump(message, this.logs.firstChild);
    },

    dumpSeparator: function()
    {
        Firebug.TraceModule.MessageTemplate.dumpSeparator(
            this.logs.firstChild);
    },

    // Trace console toolbar commands
    onClearConsole: function()
    {
        var tbody = this.logs.firstChild;
        while (tbody.firstChild)
            tbody.removeChild(tbody.lastChild);
    },

    onSeparateConsole: function()
    {
        Firebug.TraceModule.MessageTemplate.dumpSeparator(this.logs.firstChild);
    },

    onSaveToFile: function()
    {
    },

    onRestartFirefox: function()
    {
        Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup).
            quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
    },

    onExitFirefox: function()
    {
        goQuitApplication();
    }
};

// ************************************************************************************************
