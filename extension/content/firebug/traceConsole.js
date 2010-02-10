/* See license.txt for terms of usage */

// ************************************************************************************************
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;

const traceService = Cc["@joehewitt.com/firebug-trace-service;1"].getService(Ci.nsIObserverService);

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch2);
const prefService = PrefService.getService(Ci.nsIPrefService);

var gFindBar;

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;
const reEndings = /\r\n|\r|\n/;

// The lib.js isn't included in this window so, define the global here.
// It'll be initialized from window parameters (see initialize method).
var FBL;

// Cache messages that are fired before the content of the window is loaded.
var queue = [];

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
        document.title = FBL.$STR("title.Tracing") + ": " + this.prefDomain;

        // Register listeners and observers
        traceService.addObserver(this, "firebug-trace-on-message", false);
        prefs.addObserver(this.prefDomain, this, false);

        // Initialize root node of the trace-console window.
        var consoleFrame = document.getElementById("consoleFrame");
        this.consoleNode = consoleFrame.contentDocument.getElementById("panelNode-traceConsole");
        Firebug.TraceModule.CommonBaseUI.initializeContent(this.consoleNode, this, this.prefDomain,
            FBL.bind(this.initializeContent, this));

        gFindBar = document.getElementById("FindToolbar");
    },

    initializeContent: function(logNode)
    {
        this.logs = logNode;

        // Notify listeners
        Firebug.TraceModule.onLoadConsole(window, logNode);

        // Make sure the UI is localized.
        this.internationalizeUI();
        this.updateTimeInfo();

        // If the opener is closed the console must be also closed.
        // (this console uses shared object from the opener (e.g. Firebug)
        window.opener.addEventListener("close", this.onCloseOpener, true);
        this.addedOnCloseOpener = true;

        // Fetch all cached messages.
        for (var i=0; i<queue.length; i++)
            this.dump(queue[i]);
    },

    internationalizeUI: function()
    {
        var buttons = ["clearConsole", "findConsole", "separateConsole",
            "restartFirefox", "closeFirefox", "saveToFile", "loadFromFile"];

        for (var i=0; i<buttons.length; i++)
        {
            var element = document.getElementById(buttons[i]);
            FBL.internationalize(element, "label");
            FBL.internationalize(element, "tooltiptext");
        }
    },

    updateTimeInfo: function()
    {
        var showTime = Firebug.getPref(this.prefDomain, "trace.showTime");
        if (showTime)
            FBL.setClass(this.logs.firstChild, "showTime");
        else
            FBL.removeClass(this.logs.firstChild, "showTime");
    },

    shutdown: function()
    {
        traceService.removeObserver(this, "firebug-trace-on-message");
        prefs.removeObserver(this.prefDomain, this, false);

        Firebug.TraceModule.onUnloadConsole(window);

        // Unregister from the opener
        if (this.addedOnCloseOpener)
        {
            window.opener.removeEventListener("close", this.onCloseOpener, true);
            delete this.addedOnCloseOpener;
        }
    },

    onCloseOpener: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("traceConsole.onCloseOpener closing window "+window.location);

        window.close();
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

            var message = new Firebug.TraceModule.TraceMessage(
                messageInfo.type, data, messageInfo.obj, messageInfo.scope,
                messageInfo.time);

            // If the content isn't loaded yet, remember all messages and insert them later.
            if (this.logs)
                this.dump(message);
            else
                queue.push(message);

            return true;
        }
        else if (topic == "nsPref:changed")
        {
            if (data == this.prefDomain + ".trace.showTime")
                this.updateTimeInfo();
        }
    },

    // ********************************************************************************************
    // Interface to the output nodes, going by the name outputNodes

    getScrollingNode: function()
    {
        //window.dump(FBL.getStackDump());
        //window.dump("traceConsole getScrollingNode this.scrollingNode "+this.scrollingNode+"\n");

        return this.scrollingNode;
    },

    setScrollingNode: function(node)
    {
        this.scrollingNode = node;
    },

    getTargetNode: function()
    {
        //window.dump(FBL.getStackDump());
        //window.dump("traceConsole getTargetgNode this.scrollingNode "+this.logs.firstChild+"\n");

        return this.logs.firstChild;
    },

    // ********************************************************************************************
    // Message dump

    dump: function(message)
    {
        Firebug.TraceModule.dump(message, this);
    },

    dumpSeparator: function()
    {
        Firebug.TraceModule.MessageTemplate.dumpSeparator(this);
    },

    // Trace console toolbar commands
    onClearConsole: function()
    {
        FBL.clearNode(this.logs.firstChild);
    },

    onSeparateConsole: function()
    {
        Firebug.TraceModule.MessageTemplate.dumpSeparator(this);
    },

    onSaveToFile: function()
    {
        try
        {
            var nsIFilePicker = Ci.nsIFilePicker;
            var fp = Cc["@mozilla.org/filepicker;1"].getService(nsIFilePicker);
            fp.init(window, null, nsIFilePicker.modeSave);
            fp.appendFilter("Firebug Tracing Logs","*.ftl;");
            fp.appendFilters(nsIFilePicker.filterAll);
            fp.filterIndex = 1;
            fp.defaultString = "firebug-tracing-logs.ftl";

            var rv = fp.show();
            if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
            {
                var foStream = Cc["@mozilla.org/network/file-output-stream;1"]
                    .createInstance(Ci.nsIFileOutputStream);
                foStream.init(fp.file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

                var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
                var currLocale = Firebug.getPref("general.useragent", "locale");
                var systemInfo = Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag); 

                var log = { version: "1.0" };

                // Firebug info version
                log.firebug = Firebug.version;
                log.app = {
                    name: appInfo.name,
                    version: appInfo.version,
                    platformVersion: appInfo.platformVersion,
                    buildID: appInfo.appBuildID,
                    locale: currLocale
                };
                log.os = {
                    name: systemInfo.getProperty("name"),
                    version: systemInfo.getProperty("version")
                };
                log.date = (new Date()).toGMTString();
                log.messages = [];

                // Iterate over all logs and store it into a file.
                var tbody = this.logs.firstChild;
                for (var row = tbody.firstChild; row; row = row.nextSibling)
                    this.saveMessage(log, row.repObject);

                var jsonString = JSON.stringify(log, null, "  ");
                foStream.write(jsonString, jsonString.length);
                foStream.close();
            }
        }
        catch (err)
        {
            alert(err.toString());
        }
    },

    onLoadFromFile: function()
    {
        try
        {
            var nsIFilePicker = Ci.nsIFilePicker;
            var fp = Cc["@mozilla.org/filepicker;1"].getService(nsIFilePicker);
            fp.init(window, null, nsIFilePicker.modeOpen);
            fp.appendFilters(nsIFilePicker.filterAll);
            fp.appendFilter("Firebug Tracing Logs", "*.ftl;");
            fp.filterIndex = 1;

            var rv = fp.show();
            if (rv != nsIFilePicker.returnOK)
                return;

            var inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Ci.nsIFileInputStream);
            inputStream.init(fp.file, -1, -1, 0); // read-only

            // Read and parset the content
            var jsonString = FBL.readFromStream(inputStream)
            var log = JSON.parse(jsonString);
            if (!log)
            {
                alert("No log data available.");
                return;
            }

            log.filePath = fp.file.path;

            var MessageTemplate = Firebug.TraceModule.MessageTemplate;
            var TraceModule = Firebug.TraceModule;

            // Create header, dump all logs and create footer.
            MessageTemplate.dumpSeparator(this, MessageTemplate.importHeaderTag, log);
            for (var i=0; i<log.messages.length; i++)
            {
                var logMsg = log.messages[i];
                if (!logMsg.type)
                    continue;
                else if (logMsg.type == "separator")
                    MessageTemplate.dumpSeparator(this);
                else
                    MessageTemplate.dump(new TraceModule.ImportedMessage(logMsg), this);
            }
            MessageTemplate.dumpSeparator(this, MessageTemplate.importFooterTag);
        }
        catch (err)
        {
            alert(err.toString());
        }
    },

    saveMessage: function(log, message)
    {
        if (!message)
            return;

        var text = message.text;
        text = text ? text.replace(reEndings, "") : "---";
        text = text.replace(/"|'/g, "");

        var msgLog = {
            index: message.index,
            text: message.text,
            type: message.type ? message.type : "",
            time: message.time,
            stack: []
        };

        var stack = message.stack;
        for (var i=0; stack && i<stack.length; i++)
        {
            var frame = stack[i];
            msgLog.stack.push({
                fileName: frame.fileName,
                lineNumber: frame.lineNumber,
                funcName: frame.funcName,
            });
        }

        log.messages.push(msgLog);
    },

    onRestartFirefox: function()
    {
        Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup).
            quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
    },

    onExitFirefox: function()
    {
        goQuitApplication();
    },
};

// ************************************************************************************************
