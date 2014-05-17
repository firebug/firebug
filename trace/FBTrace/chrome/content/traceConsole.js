/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/locale",
    "fbtrace/lib/object",
    "fbtrace/lib/css",
    "fbtrace/lib/dom",
    "fbtrace/lib/options",
    "fbtrace/lib/array",
    "fbtrace/serializer",
    "fbtrace/traceMessage",
    "fbtrace/messageTemplate",
    "fbtrace/commonBaseUI",
    "fbtrace/traceCommandLine",
    "fbtrace/traceModule",
    "fbtrace/lib/reps",
    "fbtrace/lib/menu",
    "fbtrace/traceErrorListener",
],
function(FBTrace, Locale, Obj, Css, Dom, Options, Arr, Serializer, TraceMessage,
    MessageTemplate, CommonBaseUI, TraceCommandLine, TraceModule, Reps, Menu,
    TraceErrorListener) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

try
{
    Cu["import"]("resource://fbtrace/firebug-trace-service.js");
}
catch (err)
{
    dump("TraceConsole; Loading modules EXCEPTION " + err + "\n");
}

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch);
const prefService = PrefService.getService(Ci.nsIPrefService);
const directoryService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

// Cache messages that are fired before the content of the window is loaded.
var queue = [];

// Get trace service (we need to register/unregister a listener later)
var scope = {};
Cu["import"]("resource://fbtrace/firebug-trace-service.js", scope);
var traceService = scope.traceConsoleService;

// For Tracing Console UI
Locale.registerStringBundle("chrome://fbtrace/locale/firebug-tracing.properties");

// ********************************************************************************************* //
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
        document.title = Locale.$STR("title.Tracing") + ": " + this.prefDomain;

        try
        {
            for( var p in args)
                window.dump("args "+p+"\n");

            window.dump("FBTrace; Firebug for Tracing Console is initialized\n");
            this.initializeConsole();
        }
        catch (exc)
        {
            var msg = exc.toString() +" "+(exc.fileName || exc.sourceName) + "@" + exc.lineNumber;
            window.dump("FBTrace; TraceModule.initialize EXCEPTION " + msg);
        }

        window.gFindBar = document.getElementById("FindToolbar");

        TraceErrorListener.startObserving();
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
        this.internationalizeUI(window.document);

        this.consoleNode = consoleFrame.contentDocument.getElementById("panelNode-traceConsole");

        CommonBaseUI.initializeContent(
            this.consoleNode, this, this.prefDomain,
            Obj.bind(this.initializeContent, this));

        gFindBar = document.getElementById("FindToolbar");
    },

    initializeContent: function(logNode)
    {
        try
        {
            this.logs = logNode;

            // Notify listeners
            TraceModule.onLoadConsole(window, logNode);

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

    updateTimeInfo: function()
    {
        var showTime = Options.get("trace.showTime");
        if (showTime)
            Css.setClass(this.logs.firstChild, "showTime");
        else
            Css.removeClass(this.logs.firstChild, "showTime");
    },

    shutdown: function()
    {
        traceService.removeObserver(this, "firebug-trace-on-message");
        prefs.removeObserver(this.prefDomain, this, false);

        TraceModule.onUnloadConsole(window);

        // Unregister from the opener
        if (this.addedOnCloseOpener)
        {
            window.opener.removeEventListener("close", this.onCloseOpener, true);
            delete this.addedOnCloseOpener;
        }

        TraceErrorListener.stopObserving();
    },

    onCloseOpener: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("traceConsole.onCloseOpener closing window "+window.location);

        window.close();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Localization

    /**
     *  Substitute strings in the UI, with fall back to en-US
     */
    internationalizeUI: function(doc)
    {
        if (!doc)
            return;

        var elements = doc.getElementsByClassName("fbInternational");
        elements = Arr.cloneArray(elements);
        var attributes = ["label", "tooltiptext", "aria-label"];
        for (var i=0; i<elements.length; i++)
        {
            var element = elements[i];
            Css.removeClass(elements[i], "fbInternational");
            for (var j=0; j<attributes.length; j++)
            {
                if (element.hasAttribute(attributes[j]))
                    Locale.internationalize(element, attributes[j]);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Asynchronous display

    initLayoutTimer: function()
    {
        var layoutTimeout = Options.get("fbtrace.layoutTimeout");
        if (typeof(layoutTimeout) == "undefined")
            return;

        if (layoutTimeout <= 0)
            return;

        if (this.layoutTimeout)
            clearTimeout(this.layoutTimeout);

        var handler = Obj.bindFixed(this.flushCachedMessages, this);
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

            var message = new TraceMessage(messageInfo.type, data, messageInfo.obj,
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
        return this.scrollingNode;
    },

    setScrollingNode: function(node)
    {
        this.scrollingNode = node;
    },

    getTargetNode: function()
    {
        return this.logs.firstChild;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Message dump

    dump: function(message)
    {
        MessageTemplate.dump(message, this);
    },

    dumpSeparator: function()
    {
        MessageTemplate.dumpSeparator(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Trace console toolbar commands

    onClearConsole: function()
    {
        Dom.clearNode(this.logs.firstChild);
    },

    onSeparateConsole: function()
    {
        this.dumpSeparator();
    },

    onSaveToFile: function()
    {
        Serializer.onSaveToFile(this);
    },

    onLoadFromFile: function()
    {
        Serializer.onLoadFromFile(this);
    },

    onRestartFirefox: function()
    {
        prefService.savePrefFile(null);

        var canceled = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);

        Services.obs.notifyObservers(canceled, "quit-application-requested", "restart");

        // Somebody canceled the quit request
        if (canceled.data)
            return false;

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
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("traceConsole.onClearCache EXCEPTION " + exc, exc);
        }
    },

    onForceGC: function()
    {
        try
        {
            Cu.forceGC();
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("traceConsole.onForceGC EXCEPTION " + exc, exc);
        }
    },

    openProfileDir: function(context)
    {
        var profileFolder = directoryService.get("ProfD", Ci.nsIFile);
        var path = profileFolder.QueryInterface(Ci.nsIFile).path;
        var fileLocal = Cc["@mozilla.org/file/local;1"].getService(Ci.nsIFile);
        fileLocal.initWithPath(path);
        fileLocal.launch();
    },

    openFirefox: function(context)
    {
        var handler = Cc["@mozilla.org/browser/clh;1"].getService(Ci.nsIBrowserHandler);
        var defaultArgs = handler.defaultArgs;

        window.openDialog("chrome://browser/content/", "_blank",
            "chrome,all,dialog=no", defaultArgs);
    },

    toggleFirebug: function(on)
    {
        Cu["import"]("resource://gre/modules/Services.jsm");
        Services.obs.notifyObservers(null, "startupcache-invalidate", null);

        var BOOTSTRAP_REASONS = {
            APP_STARTUP     : 1,
            APP_SHUTDOWN    : 2,
            ADDON_ENABLE    : 3,
            ADDON_DISABLE   : 4,
            ADDON_INSTALL   : 5,
            ADDON_UNINSTALL : 6,
            ADDON_UPGRADE   : 7,
            ADDON_DOWNGRADE : 8
        };

        var XPIProviderBP;
        try
        {
            XPIProviderBP = Cu.import("resource://gre/modules/addons/XPIProvider.jsm", {});
        }
        catch (err)
        {
            XPIProviderBP = Cu.import("resource://gre/modules/XPIProvider.jsm", {});
        }

        var id = "firebug@software.joehewitt.com";
        var XPIProvider = XPIProviderBP.XPIProvider;
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        file.persistentDescriptor = XPIProvider.bootstrappedAddons[id].descriptor;

        var t1 = Date.now();
        XPIProvider.callBootstrapMethod(id, XPIProvider.bootstrappedAddons[id].version,
            XPIProvider.bootstrappedAddons[id].type, file,
            "shutdown", BOOTSTRAP_REASONS.ADDON_DISABLE);

        FBTrace.sysout("shutdown time :" + (Date.now() - t1) + "ms");

        if (!on)
            return;

        t1 = Date.now()
        XPIProvider.callBootstrapMethod(id, XPIProvider.bootstrappedAddons[id].version,
            XPIProvider.bootstrappedAddons[id].type, file,
            "startup", BOOTSTRAP_REASONS.APP_STARTUP);

        FBTrace.sysout("startup time :" + (Date.now() - t1) + "ms");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Command Line

    toggleCommandLine: function()
    {
        TraceCommandLine.toggleCommandLine();
    },

    evaluate: function()
    {
        TraceCommandLine.evaluate();
    },

    onCmdContextMenuShowing: function(event)
    {
        TraceCommandLine.onContextMenuShowing(event);
    },

    onCmdContextMenuHidden: function(event)
    {
        TraceCommandLine.onContextMenuHidden(event);
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
                    var checked = Options.get(option);
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

        var value = Options.get(option);
        Options.set(option, !value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextShowing: function(event)
    {
        var popup = event.target;
        if (popup.id != "fbContextMenu")
            return false;

        var target = document.popupNode;

        Dom.eraseNode(popup);

        var object;
        if (target)
            object = Reps.getRepObject(target);

        var rep = Reps.getRep(object);
        var realObject = rep ? rep.getRealObject(object) : null;
        var realRep = realObject ? Reps.getRep(realObject) : null;

        // 1. Add the custom menu items from the realRep
        if (realObject && realRep)
        {
            var items = realRep.getContextMenuItems(realObject, target);
            if (items)
                Menu.createMenuItems(popup, items);
        }

        // 2. Add the custom menu items from the original rep
        if (object && rep && rep != realRep)
        {
            var items = rep.getContextMenuItems(object, target);
            if (items)
                Menu.createMenuItems(popup, items);
        }

        if (!popup.firstChild)
            return false;

        return true;
    },

    onTooltipShowing: function(event)
    {
        var tooltip = window.document.getElementById("fbTooltip");
        var target = document.tooltipNode;

        var object;

        if (target && target.ownerDocument == document)
            object = Reps.getRepObject(target);

        var rep = object ? Reps.getRep(object) : null;
        object = rep ? rep.getRealObject(object) : null;
        rep = object ? Reps.getRep(object) : null;

        if (object && rep)
        {
            var label = rep.getTooltip(object);
            if (label)
            {
                tooltip.setAttribute("label", label);
                return true;
            }
        }

        if (Css.hasClass(target, 'noteInToolTip'))
            Css.setClass(tooltip, 'noteInToolTip');
        else
            Css.removeClass(tooltip, 'noteInToolTip');

        if (target && target.hasAttribute("title"))
        {
            tooltip.setAttribute("label", target.getAttribute("title"));
            return true;
        }

        return false;
    },
};

// ********************************************************************************************* //
// Registration

return TraceConsole;

// ********************************************************************************************* //
});

