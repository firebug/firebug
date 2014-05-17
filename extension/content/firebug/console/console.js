/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/search",
    "firebug/lib/xml",
    "firebug/lib/options",
    "firebug/chrome/window",
    "firebug/chrome/firefox",
    "firebug/chrome/panelNotification",
    "firebug/chrome/activableModule",
    "firebug/console/consoleBase",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/dom/domBaseTree",
    "firebug/remoting/debuggerClient",
],
function(Firebug, FBTrace, Obj, Events, Locale, Search, Xml, Options, Win, Firefox,
    PanelNotification, ActivableModule, ConsoleBase, SourceLink, StackFrame, StackTrace,
    DomBaseTree, DebuggerClient) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;
var scope = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
var {ConsoleAPIListener} = scope.devtools.require("devtools/toolkit/webconsole/utils");

// Note: createDefaultReturnValueInstance() is a local helper (see below).
var defaultReturnValue = createDefaultReturnValueInstance();

var Trace = FBTrace.to("DBG_CONSOLE");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Console Implementation

/**
 * @module Represents module for the Console panel. Responsible e.g. for handling
 * user actions related to Console panel filter.
 */
var ActivableConsole = Obj.extend(ActivableModule, ConsoleBase);
var Console = Obj.extend(ActivableConsole,
/** @lends Firebug.Console */
{
    dispatchName: "console",
    toolName: "console",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    showPanel: function(browser, panel)
    {
    },

    getExposedConsole: function(win)
    {
        return this.injector.getExposedConsole(win);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    initialize: function()
    {
        ActivableModule.initialize.apply(this, arguments);

        Firebug.connection.addListener(this);
        DebuggerClient.addListener(this);
    },

    initializeUI: function()
    {
        // Synchronize UI buttons with the current filter
        this.syncFilterButtons(Firebug.chrome);

        // Initialize filter button tooltips
        var doc = Firebug.chrome.window.document;
        var filterButtons = doc.getElementsByClassName("fbConsoleFilter");
        for (var i=0, len=filterButtons.length; i<len; ++i)
        {
            if (filterButtons[i].id != "fbConsoleFilter-all")
            {
                filterButtons[i].tooltipText = Locale.$STRF("firebug.labelWithShortcut",
                    [filterButtons[i].tooltipText, Locale.$STR("tooltip.multipleFiltersHint")]);
            }
        }
    },

    shutdown: function()
    {
        ActivableModule.shutdown.apply(this, arguments);

        Firebug.connection.removeListener(this);
        DebuggerClient.removeListener(this);
    },

    initContext: function(context, persistedState)
    {
        Trace.sysout("console.initContext;");

        ActivableModule.initContext.apply(this, arguments);

        if (this.isEnabled())
            this.attachConsoleToWindows(context);
    },

    destroyContext: function(context)
    {
        if (context && context.consoleOnDOMWindowCreated)
        {
            context.browser.removeEventListener("DOMWindowCreated",
                context.consoleOnDOMWindowCreated);

            context.consoleOnDOMWindowCreated = null;
        }
        if (context && context.consoleApiListener)
        {
            context.consoleApiListener.destroy();
            context.consoleApiListener = null;
        }
    },

    /**
     * Attach the `console` object to the window of the context and its iframes.
     * Also listen to iframe creations to attach it automatically.
     *
     * *Caution*: Designed to be used only in Firebug.Console. Should not be used elsewhere.
     *
     * @param {Context} context
     */
    attachConsoleToWindows: function(context)
    {
        if (context.consoleApiListener)
            return;

        // Setup a listener for the built-in console API, to catch console API
        // calls from web workers (and calls made on a copy of "console" taken
        // from before Firebug was enabled, for that sake).
        var processApiCall = this.processConsoleApiCall.bind(this, context);
        context.consoleApiListener = new ConsoleAPIListener(context.window, {
            onConsoleAPICall: processApiCall
        });
        context.consoleApiListener.init();

        // Attach the Console for the window and its iframes.
        Win.iterateWindows(context.window, function(win)
        {
            Console.injector.attachConsoleInjector(context, win);
        });

        // Listen to DOMWindowCreated for future iframes. Also necessary when Firebug is enabled at
        // page load.
        if (!context.consoleOnDOMWindowCreated)
        {
            context.consoleOnDOMWindowCreated = function(ev)
            {
                if (ev && ev.target)
                    Console.injector.attachConsoleInjector(context, ev.target.defaultView);
            };
            context.browser.addEventListener("DOMWindowCreated", context.consoleOnDOMWindowCreated);
        }
    },

    processConsoleApiCall: function(context, ev)
    {
        Trace.sysout("console.processConsoleApiCall", ev);
        var level = ev.level;
        var args = ev.arguments;
        // In Firefox 30 and below 'styles' does not exist.
        var styles = ev.styles || [];

        var sourceLink = ev.filename ? new SourceLink(ev.filename, ev.lineNumber, "js") : null;
        var handler = Firebug.ConsoleExposed.ConsoleHandler;

        function getTrace()
        {
            if (!ev.stacktrace)
                return null;
            var trace = new StackTrace();
            for (let fr of ev.stacktrace)
            {
                trace.frames.push(new StackFrame({href: fr.filename},
                    fr.lineNumber, fr.functionName, [], null, null, context));
            }
            return trace;
        }

        switch (level)
        {
            case "log":
            case "info":
            case "warn":
            case "debug":
                var logArgs = this.convertApiCallArguments(args, styles);
                handler.log(context, logArgs, level, sourceLink);
                break;

            case "time":
                // Do nothing - we'll act on timeEnd.
                break;

            case "timeEnd":
                handler.timeEnd(context, ev.timer.name, ev.timer.duration, sourceLink);
                break;

            case "error":
            case "exception":
            case "assert":
                var type = (level === "assert" ? "assert" : "error");
                var logArgs = args.map(this.convertApiCallArgument.bind(this));
                handler.logError(context, logArgs, type, ev.filename, ev.lineNumber, getTrace());
                break;

            case "trace":
                handler.trace(context, getTrace());
                break;

            case "group":
            case "groupCollapsed":
                handler.group(context, args, (level === "group"), sourceLink);
                break;

            case "groupEnd":
                handler.groupEnd(context);
                break;

            case "dir":
                handler.dir(context, args[0]);
                break;

            case "count":
                var key = args[0];
                var strKey = (key == null ? "" : String(key));
                handler.count(context, strKey, sourceLink);
                break;

            default:
                Trace.sysout("console.processConsoleApiCall; unhandled console API " + level);
        }
    },

    /*
     * Convert arguments gotten from the built-in console listener into a form
     * that Console.logFormatted can understand. Sort of a hack, but way better
     * than maintaining two separate console formatters.
     */
    convertApiCallArguments: function(args, styles)
    {
        if (!args.length)
            return args;
        var formatStr = "";
        var res = [];
        for (var i = 0; i < styles.length; i++)
        {
            if (styles[i])
            {
                formatStr += "%c";
                res.push(styles[i]);
            }
            var thing = this.convertApiCallArgument(args[i]);
            formatStr += (typeof thing === "string" ? "%s" : "%o");
            res.push(thing);
        }
        res.unshift(formatStr);

        for (var i = styles.length; i < args.length; i++)
            res.push(this.convertApiCallArgument(args[i]));

        return res;
    },

    convertApiCallArgument: function(val)
    {
        // For the web worker console, some complex objects 'obj' get converted
        // into new String(obj.toString()). There is not much we can do about
        // this, but at least convert it back to a string so that the display
        // doesn't look horrendous.
        if (typeof val === "object" && Object.prototype.toString.call(val) === "[object String]")
            return String(val);
        return val;
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel("console");
        panel.persistContent = panel.persistContent ? false : true;

        Firebug.chrome.setGlobalAttribute("cmd_firebug_togglePersistConsole", "checked",
            panel.persistContent);
    },

    showContext: function(browser, context)
    {
        Firebug.chrome.setGlobalAttribute("cmd_firebug_clearConsole", "disabled", !context);

        ActivableModule.showContext.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // ActivableModule

    onObserverChange: function(observer)
    {
        if (!Firebug.getSuspended())
            this.onResumeFirebug();
        else
            this.onSuspendFirebug();
    },

    onSuspendFirebug: function()
    {
        Trace.sysout("console.onSuspendFirebug; isAlwaysEnabled: " +
            Console.isAlwaysEnabled());

        if (Firebug.Errors.toggleWatchForErrors(false))
        {
            this.setStatus();

            // Make sure possible errors coming from the page and displayed in the Firefox
            // status bar are removed.
            this.clear();
        }

        // TODO: at some point we want to detach WebConsoleActor since the Console panel
        // is disabled now. This should be done for all contexts.
    },

    onResumeFirebug: function()
    {
        Trace.sysout("console.onResumeFirebug;");

        var watchForErrors = Console.isAlwaysEnabled() || Console.hasObservers();
        if (Firebug.Errors.toggleWatchForErrors(watchForErrors))
            this.setStatus();

        // TODO: at some point we want to attach WebConsoleActor since the Console panel
        // is enabled now. This should be done for all contexts.
    },

    onToggleFilter: function(event, context, filterType)
    {
        if (!context)
            context = Firebug.currentContext;

        var filterTypes = [];
        if (Events.isControl(event) && filterType != "all")
        {
            filterTypes = Options.get("consoleFilterTypes").split(" ");
            var filterTypeIndex = filterTypes.indexOf(filterType);
            if (filterTypeIndex == -1)
                filterTypes.push(filterType);
            else
                filterTypes.splice(filterTypeIndex, 1);
        }
        else
        {
            filterTypes.push(filterType);
        }

        // Remove "all" filter in case several filters are selected
        if (filterTypes.length > 1)
        {
            var allIndex = filterTypes.indexOf("all");
            if (allIndex != -1)
                filterTypes.splice(allIndex, 1);
        }

        // If no filter categories are selected, use the default
        if (filterTypes.length == 0)
            filterTypes = Options.getDefault("consoleFilterTypes").split(" ");

        Options.set("consoleFilterTypes", filterTypes.join(" "));

        this.syncFilterButtons(Firebug.chrome);

        Events.dispatch(Console.fbListeners, "onFiltersSet", [filterTypes]);
    },

    syncFilterButtons: function(chrome)
    {
        var filterTypes = new Set();
        Options.get("consoleFilterTypes").split(" ").forEach(function(element)
        {
            filterTypes.add(element);
        });

        var doc = chrome.window.document;
        var buttons = doc.getElementsByClassName("fbConsoleFilter");

        for (var i=0, len=buttons.length; i<len; ++i)
        {
            var filterType = buttons[i].id.substr(buttons[i].id.search("-") + 1);
            buttons[i].checked = filterTypes.has(filterType);
        }
    },

    setStatus: function()
    {
        var fbStatus = Firefox.getElementById("firebugStatus");
        if (fbStatus)
        {
            if (Firebug.Errors.watchForErrors)
                fbStatus.setAttribute("console", "on");
            else
                fbStatus.removeAttribute("console");
        }
        else
        {
            TraceError.sysout("console.setStatus; ERROR no firebugStatus element");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle,
        noRow, callback)
    {
        if (!context)
            context = Firebug.currentContext;

        if (!context)
            TraceError.sysout("Console.logRow; no context");

        if (this.isAlwaysEnabled())
            return ConsoleBase.logRow.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Returns the value that the console must ignore.
     *
     * @return {*} The default value
     */
    getDefaultReturnValue: function()
    {
        return defaultReturnValue;
    },

    /**
     * Returns true if the passed object has to be ignored by the console.
     *
     * @param {*} o The object to test
     *
     * @return {boolean} The result of the test
     */
    isDefaultReturnValue: function(obj)
    {
        return obj === defaultReturnValue;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerClient

    onTabAttached: function(browser, reload)
    {
        Trace.sysout("console.onTabAttached; reload: " + reload);

        // TODO: at some point we want to attach the WebConsoleActor here
    },

    onTabDetached: function(browser)
    {
        Trace.sysout("source.onTabDetached; ");

        // TODO: at some point we want to detach the WebConsoleActor here
    },
});

// ********************************************************************************************* //

Firebug.ConsoleListener =
{
    log: function(context, object, className, sourceLink)
    {
    },

    logFormatted: function(context, objects, className, sourceLink)
    {
    }
};

// ********************************************************************************************* //
// Local Helpers

function createDefaultReturnValueInstance()
{
    var proto =
    {
        __exposedProps__:
        {
            "toString": "rw"
        },

        toString: function()
        {
            return undefined;
        }
    };

    return Object.preventExtensions(Object.create(proto));
}

// ********************************************************************************************* //
// Registration

Firebug.Console = Console;

Firebug.registerActivableModule(Console);

return Console;

// ********************************************************************************************* //
});
