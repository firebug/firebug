/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/events",
    "fbtrace/lib/window",
    "fbtrace/lib/object",
    "fbtrace/lib/options",
],
function(FBTrace, Events, Win, Obj, Options) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

// ********************************************************************************************* //
// Trace Module

var TraceModule = Obj.extend({},
{
    dispatchName: "traceModule",

    initialize: function()
    {
        // prefDomain is the calling app, firebug or chromebug
        this.prefDomain = Options.getPrefDomain();
        window.dump("FBTrace; TraceModule.initialize: " + this.prefDomain + "\n");

        FBTrace.DBG_OPTIONS = Options.get("DBG_OPTIONS");

        // Open console automatically if the pref says so.
        //if (Options.get("alwaysOpenTraceConsole"))
        //    this.openConsole();

        window.dump("traceModule.initialize: " + this.prefDomain+" alwaysOpen: " +
            Options.get("alwaysOpenTraceConsole") + "\n");
    },

    shutdown: function()
    {
    },

    reattachContext: function(browser, context)
    {
        if (FBTrace.DBG_OPTIONS)
        {
            FBTrace.sysout("traceModule.reattachContext for: " +
                context ? context.getName() : "null context",
                [browser, context]);
        }
    },

    getTraceConsoleURL: function()
    {
        return "chrome://fbtrace/content/traceConsole.xul";
    },

    onToggleOption: function(target)
    {
        TraceConsole.onToggleOption(target);

        // Open automatically if set to "always open", close otherwise.
        if (Options.get("alwaysOpenTraceConsole"))
            this.openConsole();
        else
            this.closeConsole();
    },

    closeConsole: function(prefDomain)
    {
        if (!prefDomain)
            prefDomain = this.prefDomain;

        var consoleWindow = null;
        Win.iterateBrowserWindows("FBTraceConsole", function(win)
        {
            if (win.TraceConsole.prefDomain == prefDomain)
            {
                consoleWindow = win;
                return true;
            }
        });

        if (consoleWindow)
            consoleWindow.close();
    },

    openConsole: function(prefDomain, windowURL)
    {
        if (!prefDomain)
            prefDomain = this.prefDomain;

        var self = this;
        Win.iterateBrowserWindows("FBTraceConsole", function(win)
        {
            if (win.TraceConsole.prefDomain == prefDomain)
            {
                self.consoleWindow = win;
                return true;
            }
        });

        // Try to connect an existing trace-console window first.
        if (this.consoleWindow && this.consoleWindow.TraceConsole)
        {
            this.consoleWindow.focus();
            return;
        }

        if (!windowURL)
            windowURL = this.getTraceConsoleURL();

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("traceModule.openConsole, prefDomain: " + prefDomain);

        // xxxHonza
        var self = this;
        var args = {
            //FBL: FBL,
            //Firebug: Firebug,
            traceModule: self,
            prefDomain: prefDomain,
        };

        if (FBTrace.DBG_OPTIONS)
        {
            for (var p in args)
                FBTrace.sysout("tracePanel.openConsole prefDomain:" +
                    prefDomain +" args["+p+"]= "+ args[p]+"\n");
        }

        this.consoleWindow = window.openDialog(
            windowURL,
            "FBTraceConsole." + prefDomain,
            "chrome,resizable,scrollbars=auto,minimizable,dialog=no",
            args);
    },

    // Trace console listeners
    onLoadConsole: function(win, rootNode)
    {
        var win = wm.getMostRecentWindow("navigator:browser");
        if (!(win && win.Firebug && win.Firebug.TraceModule))
            return;

        var listeners = win.Firebug.TraceModule.fbListeners;
        for (var i=0; i<listeners.length; i++)
            listeners.onLoadConsoleExecuted = true;

        Events.dispatch(listeners, "onLoadConsole", [win, rootNode]);
    },

    onUnloadConsole: function(win)
    {
        var win = wm.getMostRecentWindow("navigator:browser");
        if (win && win.Firebug && win.Firebug.TraceModule)
            Events.dispatch(win.Firebug.TraceModule.fbListeners, "onUnloadConsole", [win]);
    },

    onDump: function(message, outputNodes)
    {
        // Don't dispatch to listener in this scope - TraceConsole.xul
        // We need to dispatch to listenres registered within Firebug
        // which is browser.xul scope.
        //dispatch(this.fbListeners, "onDump", [message]);

        // Get browser window with Firebug and distribute dump for customization.
        var win = wm.getMostRecentWindow("navigator:browser");
        if (!(win && win.Firebug && win.Firebug.TraceModule))
            return;

        var consoleWin = outputNodes.logs.parentNode.ownerDocument.defaultView;
        var rootNode = outputNodes.logs;

        // Fire "onLoadConsole" for listeners that have been registered
        // after the console has been opened.
        var listeners = win.Firebug.TraceModule.fbListeners;
        for (var i=0; listeners && i<listeners.length; i++)
        {
            var listener = listeners[i];
            if (!listener.onLoadConsoleExecuted)
            {
                listener.onLoadConsoleExecuted = true;
                Events.dispatch([listener], "onLoadConsole", [consoleWin, rootNode]);
            }
        }

        if (win && win.Firebug && win.Firebug.TraceModule)
            Events.dispatch(listeners, "onDump", [message]);
    },
});

// ********************************************************************************************* //

var lastPanic = null;
function onPanic(contextMessage, errorMessage)
{
    var appShellService = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService);
    var win = appShellService.hiddenDOMWindow;
    // XXXjjb I cannot get these tests to work.
    //if (win.lastPanic && (win.lastPanic == errorMessage))
        win.dump("traceModule: "+contextMessage +" panic attack "+errorMessage+"\n");
    //else
    //alert("Firebug traceModule panics: "+errorMessage);

    win.lastPanic = errorMessage;
}

// ********************************************************************************************* //
// Registration

return TraceModule;

// ********************************************************************************************* //
});
