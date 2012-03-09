/* See license.txt for terms of usage */

// ************************************************************************************************
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;

try
{
    Components.utils["import"]("resource://moduleLoader/moduleLoader.js");
    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js");
}
catch (err)
{
    dump("TraceConsole; Loading modules EXCEPTION " + err + "\n");
}

var traceService = traceConsoleService;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch2);
const prefService = PrefService.getService(Ci.nsIPrefService);
const directoryService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

var gFindBar;

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;

// Cache messages that are fired before the content of the window is loaded.
var queue = [];

// ************************************************************************************************
// Trace Window Implementation

var TraceConsole =
{
    modules: [],

    initialize: function()
    {
        window.dump("FBTrace; TraceConsole.initialize\n");

        var args = window.arguments[0];

        // Get pref domain is used for message filtering. Only logs that belong
        // to this pref-domain will be displayed. The current domain is displyaed
        // in window title.
        this.prefDomain = args.prefDomain;
        document.title = FBL.$STR("title.Tracing") + ": " + this.prefDomain;

        try
        {
            for( var p in args)
                window.dump("args "+p+"\n");

            // Firebug is already initialized in main.js (where chrome is created).
            // Firebug.initialize();

            window.dump("FBTrace; Firebug for Tracing Console is initialized\n");
            this.initializeConsole();
        }
        catch (exc)
        {
            var msg = exc.toString() +" "+(exc.fileName || exc.sourceName) + "@" + exc.lineNumber;
            window.dump("FBTrace; Firebug.TraceModule.initialize EXCEPTION " + msg + "\n");
            window.dump(FBL.getStackDump()+"\n");
        }
    },

    initializeConsole: function()
    {
        window.dump("FBTrace; initializeConsole, " + this.prefDomain + "\n");

        // Register listeners and observers
        traceService.addObserver(this, "firebug-trace-on-message", false);
        prefs.addObserver(this.prefDomain, this, false);

        // Initialize root node of the trace-console window.
        var consoleFrame = document.getElementById("consoleFrame");
        consoleFrame.droppedLinkHandler = function()
        {
            return false;
        };

        // Make sure the UI is localized.
        Firebug.internationalizeUI(window.document);

        if (!Firebug.TraceModule)
        {
            window.dump("FBTrace; Firebug.TraceModule == NULL\n");
            return;
        }

        this.consoleNode = consoleFrame.contentDocument.getElementById("panelNode-traceConsole");

        Firebug.TraceModule.CommonBaseUI.initializeContent(
            this.consoleNode, this, this.prefDomain,
            FBL.bind(this.initializeContent, this));

        gFindBar = document.getElementById("FindToolbar");
    },

    initializeContent: function(logNode)
    {
        try
        {
            this.logs = logNode;

            // Notify listeners
            Firebug.TraceModule.onLoadConsole(window, logNode);

            this.updateTimeInfo();

            // If the opener is closed the console must be also closed.
            // (this console uses shared object from the opener (e.g. Firebug)
            window.opener.addEventListener("close", this.onCloseOpener, true);
            this.addedOnCloseOpener = true;

            // Flush any cached messages (those that came since the firbug-trace-observer
            // has been registered and now.
            this.flushCachedMessages();

            FBTrace.sysout("Tracing console initialized for: " + this.prefDomain + "\n");

            if (this.releaser) {
                dump("TraceConsole releasing application thread.\n");
                this.releaser.unblock.apply(this.releaser, []);
            }
        }
        catch (err)
        {
            FBTrace.sysout("initializeContent; EXCEPTION " + err, err);
        }
    },

    createLoader: function(prefDomain, baseUrl)
    {
        try
        {
            // Require JS configuration
            var config = {};
            config.prefDomain = prefDomain;
            config.baseUrl = baseUrl;
            config.paths = {"arch": "inProcess"};

            config.onDebug = function()
            {
                window.dump("FBTrace; onDebug: ");
                for(var i = 0; i < arguments.length; i++)
                    window.dump(arguments[i] + ",");
                window.dump(".\n");
                //Components.utils.reportError(arguments[0]);
            }

            config.onError = function()
            {
                FBTrace.sysout("FBTrace; onError: " + arguments + "\n");
                window.dump("FBTrace; onError: ");
                for(var i = 0; i < arguments.length; i++)
                    window.dump(arguments[i] + ",");
                window.dump(".\n");
                Components.utils.reportError(arguments[0]);
            }

            // Defalt globals for all modules loaded using this loader.
            var firebugScope =
            {
                window : window,
                Firebug: Firebug,
                FBL: FBL,
                FBTrace: FBTrace,
                FirebugReps: FirebugReps,
                domplate: domplate,
                TraceConsole: this,
            };

            Firebug.loadConfiguration = config;

            // Create loader and load tracing module.
            return new ModuleLoader(firebugScope, config);
        }
        catch (err)
        {
            FBTrace.sysout("FBTrace; EXCEPTION " + err + "\n");
        }
    },

    updateTimeInfo: function()
    {
        var showTime = Firebug.Options.get("trace.showTime");
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Asynchronous display

    initLayoutTimer: function()
    {
        var layoutTimeout = Firebug.Options.getPref(this.prefDomain, "fbtrace.layoutTimeout");
        if (typeof(layoutTimeout) == "undefined")
            return;

        if (layoutTimeout <= 0)
            return;

        if (this.layoutTimeout)
            clearTimeout(this.layoutTimeout);

        var handler = FBL.bindFixed(this.flushCachedMessages, this);
        this.layoutTimeout = setTimeout(handler, layoutTimeout);
    },

    flushCachedMessages: function()
    {
        if (!this.logs || !queue.length)
            return;

        // Fetch all cached messages.
        for (var i=0; i<queue.length; i++)
            this.dump(queue[i]);

        queue = [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
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

            this.initLayoutTimer();

            // If the content isn't loaded yet, remember all messages and insert them later.
            if (this.logs && !this.layoutTimeout)
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Message dump

    dump: function(message)
    {
        Firebug.TraceModule.dump(message, this);
    },

    dumpSeparator: function()
    {
        Firebug.TraceModule.MessageTemplate.dumpSeparator(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
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
        TraceConsole.Serializer.onSaveToFile(this);
    },

    onLoadFromFile: function()
    {
        TraceConsole.Serializer.onLoadFromFile(this);
    },

    onRestartFirefox: function()
    {
        prefService.savePrefFile(null);

        Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup).
            quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
    },

    onExitFirefox: function()
    {
        prefService.savePrefFile(null);

        goQuitApplication();
    },

    onClearCache: function()
    {
        try
        {
            var cache = Cc["@mozilla.org/network/cache-service;1"].getService(Ci.nsICacheService);
            cache.evictEntries(Ci.nsICache.STORE_ON_DISK);
            cache.evictEntries(Ci.nsICache.STORE_IN_MEMORY);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("traceConsole.onClearCache EXCEPTION " + exc, exc);
        }
    },

    onForceGC: function()
    {
        try
        {
            FBL.jsd.GC();
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("traceConsole.onForceGC EXCEPTION " + exc, exc);
        }
    },

    openProfileDir: function(context)
    {
        var profileFolder = directoryService.get("ProfD", Ci.nsIFile);
        var path = profileFolder.QueryInterface(Ci.nsILocalFile).path;
        var fileLocal = Cc["@mozilla.org/file/local;1"].getService(Ci.nsILocalFile);
        fileLocal.initWithPath(path);
        fileLocal.launch();
    },

    openFirefox: function(context)
    {
        var handler = Components.classes["@mozilla.org/browser/clh;1"]
            .getService(Components.interfaces.nsIBrowserHandler);
        var defaultArgs = handler.defaultArgs;

        window.openDialog("chrome://browser/content/", "_blank",
            "chrome,all,dialog=no", defaultArgs);
    },

    toggleFirebug: function(on, topWin)
    {
        if (!topWin)
        {
            if (!TraceCommandLine.currentWindow)
                TraceCommandLine.toggleCommandLine();

            topWin = TraceCommandLine.currentWindow;
        }

        if (topWin.Firebug && !topWin.Firebug.isShutdown)
            topWin.Firebug.shutdown();

        var doc = topWin.document;

        // Remove all Firebug global includes (in browser.xul scope).
        var scriptList = Array.slice(doc.querySelectorAll("script[src*='firebug/content/']"));
        for each(var s in scriptList)
            s.parentNode.removeChild(s);

        // Remove Firebug panel
        var splitter = doc.getElementById("fbContentSplitter");
        var mainFrame = doc.getElementById("fbMainFrame");

        if (mainFrame)
            mainFrame.parentNode.removeChild(mainFrame);

        if (splitter)
            splitter.parentNode.removeChild(splitter);

        topWin.Firebug = null;

        if (!on)
            return;

        doc.addEventListener("FirebugLoaded", function onLoad()
        {
            doc.removeEventListener("FirebugLoaded", onLoad, false)
            setTimeout(function(){topWin.Firebug.toggleBar(true)}, 200)
        }, false);

        // In order to load Firebug, dynamically apply its main overlay.
        doc.loadOverlay("chrome://firebug/content/firefox/browserOverlayWithFrame.xul",
            {observe: function(){}});
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    onOptionsShowing: function(popup)
    {
        for (var child = popup.firstChild; child; child = child.nextSibling)
        {
            if (child.localName == "menuitem")
            {
                var option = child.getAttribute("option");
                if (option)
                {
                    var checked = Firebug.Options.get(option);
                    child.setAttribute("checked", checked);
                }
            }
        }
    },

    onToggleOption: function(target)
    {
        var option = target.getAttribute("option");
        if (!option)
            return;

        var value = Firebug.Options.get(option);
        Firebug.Options.set(option, !value);
    }
};

// ************************************************************************************************
