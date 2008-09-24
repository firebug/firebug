/* See license.txt for terms of usage */

// ************************************************************************************************
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;

const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
const traceService = Cc["@joehewitt.com/firebug-trace-service;1"].getService(Ci.nsIObserverService);
const hiddenWindow = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService).hiddenDOMWindow;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch2);
const prefService = PrefService.getService(Ci.nsIPrefService);

var gFindBar;

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;

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
        window.title = "Firebug Trace Console: " + this.prefDomain;

        // Initialize root node of the trace-console window.
        var consoleFrame = document.getElementById("consoleFrame");
        this.consoleNode = consoleFrame.contentDocument.getElementById("panelNode-traceConsole");
        this.initializeNode(this.consoleNode);

        // Register listeners and observers
        traceService.addObserver(this, "firebug-trace-on-message", false);
        consoleService.registerListener(JSErrorConsoleObserver);
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
        consoleService.unregisterListener(this.JSErrorConsoleObserver);

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

    initializeNode: function(parentNode)
    {
        // Create basic layout for trace console content.
        var rep = Firebug.TraceModule.PanelTemplate;
        rep.tag.replace({}, parentNode, rep);

        // This node is the container for all logs.
        var logTabContent = FBL.getElementByClass(parentNode, "traceInfoLogsText");
        this.logs = Firebug.TraceModule.MessageTemplate.createTable(logTabContent);

        // Initialize content for Options tab (a button for each DBG_ option).
        var optionsBody = FBL.getElementByClass(parentNode, "traceInfoOptionsText");
        var options = Firebug.TraceModule.getOptionsMenuItems();
        var doc = parentNode.ownerDocument;
        for (var i=0; i<options.length; i++)
        {
            var option = options[i];
            var button = doc.createElement("button");
            FBL.setClass(button, "traceOption");
            FBL.setItemIntoElement(button, option);
            button.innerHTML = option.label;
            button.setAttribute("id", option.pref);
            button.removeAttribute("type");
            button.addEventListener("click", option.command, false);
            optionsBody.appendChild(button);
        }

        // Select default tab.
        rep.selectTabByName(parentNode, "Logs");
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

        var index = message.text.indexOf("ERROR");
        if (index != -1)
            message.type = "DBG_ERROR";

        index = message.text.indexOf("EXCEPTION");
        if (index != -1)
            message.type = "DBG_ERROR";

        Firebug.TraceModule.MessageTemplate.dump(message, this.logs.firstChild);
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
// Javascript Error Console observer

var JSErrorConsoleObserver =
{
    observe: function(object)
    {
        if (!Firebug.getPref(Firebug.prefDomain, "trace.enableJSConsoleLogs"))
            return;

        try
        {
            if (object.message.indexOf("[JavaScript Error:") == 0)
            {
                // Log only chrome script errors.
                object = object.QueryInterface(Ci.nsIScriptError);
                if (object.sourceName && !object.sourceName.indexOf("chrome:"))
                {
                    var message = "JavaScript Error: " + object.errorMessage;
                    Firebug.TraceModule.dump(
                        new Firebug.TraceModule.TraceMessage("", message, object));
                }
            }
        }
        catch (exc)
        {
        }
    },

    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIConsoleListener))
            return this;

        throw NS_ERROR_NO_INTERFACE;
    }
}

// ************************************************************************************************
