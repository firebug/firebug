/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/chrome/window",
    "firebug/lib/search",
    "firebug/lib/xml",
    "firebug/lib/options",
    "firebug/chrome/panelNotification",
    "firebug/chrome/activableModule",
    "firebug/console/commands/profiler",
    "firebug/chrome/searchBox",
    "firebug/console/consolePanel",
    "firebug/console/commandEditor",
    "firebug/console/functionMonitor",
    "firebug/console/commands/eventMonitor",
    "firebug/console/performanceTiming",
],
function(Obj, Firebug, Firefox, Events, Locale, Win, Search, Xml, Options,
    PanelNotification, ActivableModule) {

// ********************************************************************************************* //
// Constants

var maxQueueRequests = 500;

// Note: createDefaultReturnValueInstance() is a local helper (see below).
var defaultReturnValue = createDefaultReturnValueInstance();

// ********************************************************************************************* //

Firebug.ConsoleBase =
{
    log: function(object, context, className, rep, noThrottle, sourceLink)
    {
        Events.dispatch(this.fbListeners,"log",[context, object, className, sourceLink]);
        return this.logRow(appendObject, object, context, className, rep, sourceLink, noThrottle);
    },

    logFormatted: function(objects, context, className, noThrottle, sourceLink)
    {
        Events.dispatch(this.fbListeners,"logFormatted",[context, objects, className, sourceLink]);
        return this.logRow(appendFormatted, objects, context, className, null, sourceLink,
            noThrottle);
    },

    openGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        return this.logRow(appendOpenGroup, objects, context, className, rep, sourceLink,
            noThrottle);
    },

    openCollapsedGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        return this.logRow(appendCollapsedGroup, objects, context, className, rep, sourceLink,
            noThrottle);
    },

    closeGroup: function(context, noThrottle)
    {
        return this.logRow(appendCloseGroup, null, context, null, null, null, noThrottle, true);
    },

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = Firebug.currentContext;

        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CONSOLE && !context)
            FBTrace.sysout("Console.logRow has no context, skipping objects", objects);

        if (!context)
            return;

        if (noThrottle || !context)
        {
            var panel = this.getPanel(context);
            if (panel)
            {
                var row = panel.append(appender, objects, className, rep, sourceLink, noRow);
                var container = panel.panelNode;

                while (container.childNodes.length > maxQueueRequests + 1)
                {
                    container.removeChild(container.firstChild.nextSibling);
                    panel.limit.config.totalCount++;
                    PanelNotification.updateCounter(panel.limit);
                }
                Events.dispatch(this.fbListeners, "onLogRowCreated", [panel, row, context]);
                return row;
            }
        }
        else
        {
            if (!context.throttle)
            {
                FBTrace.sysout("console.logRow has not context.throttle! ");
                return;
            }
            var args = [appender, objects, context, className, rep, sourceLink, true, noRow];
            context.throttle(this.logRow, this, args);
        }
    },

    appendFormatted: function(args, row, context)
    {
        if (!context)
            context = Firebug.currentContext;

        var panel = this.getPanel(context);
        panel.appendFormatted(args, row);
    },

    clear: function(context)
    {
        if (!context)
            context = Firebug.currentContext;

        if (context)
        {
            // There could be some logs waiting in the throttle queue, so
            // clear asynchronously after the queue is flushed.
            context.throttle(this.clearPanel, this, [context]);

            // Also clear now
            this.clearPanel(context);

            // Let listeners react to console clearing
            Events.dispatch(this.fbListeners, "onConsoleCleared", [context]);
        }
    },

    clearPanel: function(context)
    {
        Firebug.Errors.clear(context);

        var panel = this.getPanel(context, true);
        if (panel)
            panel.clear();
    },

    // Override to direct output to your panel
    getPanel: function(context, noCreate)
    {
        if (context)
            return context.getPanel("console", noCreate);
    },
};

// ********************************************************************************************* //

/**
 * @module Represents module for the Console panel. Responsible e.g. for handling
 * user actions related to Console panel filter.
 */
var ActivableConsole = Obj.extend(ActivableModule, Firebug.ConsoleBase);
Firebug.Console = Obj.extend(ActivableConsole,
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
        // Initialize log limit.
        this.updateMaxLimit();

        ActivableModule.initialize.apply(this, arguments);

        Firebug.connection.addListener(this);
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
        Firebug.connection.removeListener(this);
        ActivableModule.shutdown.apply(this, arguments);
    },

    initContext: function(context, persistedState)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.initContext");

        ActivableModule.initContext.apply(this, arguments);

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
        // Attach the Console for the window and its iframes.
        Win.iterateWindows(context.window, function(win)
        {
            Firebug.Console.injector.attachConsoleInjector(context, win);
        });

        // Listen to DOMWindowCreated for future iframes. Also necessary when Firebug is enabled at
        // page load.
        if (!context.consoleOnDOMWindowCreated)
        {
            context.consoleOnDOMWindowCreated = function(ev)
            {
                if (ev && ev.target)
                    Firebug.Console.injector.attachConsoleInjector(context, ev.target.defaultView);
            };
            context.browser.addEventListener("DOMWindowCreated", context.consoleOnDOMWindowCreated);
        }
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

    updateOption: function(name, value)
    {
        if (name == "console.logLimit")
            this.updateMaxLimit();
    },

    updateMaxLimit: function()
    {
        var value = Options.get("console.logLimit");
        maxQueueRequests =  value ? value : maxQueueRequests;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extend ActivableModule

    onObserverChange: function(observer)
    {
        if (!Firebug.getSuspended())  // then Firebug is in action
            this.onResumeFirebug();   // and we need to test to see if we need to addObserver
        else
            this.onSuspendFirebug();
    },

    onSuspendFirebug: function()
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onSuspendFirebug isAlwaysEnabled:" +
                Firebug.Console.isAlwaysEnabled());

        if (Firebug.Errors.toggleWatchForErrors(false))
        {
            this.setStatus();
            // Make sure possible errors coming from the page and displayed in the Firefox
            // status bar are removed.
            this.clear();
        }
    },

    onResumeFirebug: function()
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onResumeFirebug\n");

        var watchForErrors = Firebug.Console.isAlwaysEnabled() || Firebug.Console.hasObservers();
        if (Firebug.Errors.toggleWatchForErrors(watchForErrors))
            this.setStatus();
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

        Events.dispatch(Firebug.Console.fbListeners, "onFiltersSet", [filterTypes]);
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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("console.setStatus ERROR no firebugStatus element");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = Firebug.currentContext;

        if (FBTrace.DBG_WINDOWS && !context)
            FBTrace.sysout("Console.logRow: no context \n");

        if (this.isAlwaysEnabled())
            return Firebug.ConsoleBase.logRow.apply(this, arguments);
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
    }
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

var appendObject = Firebug.ConsolePanel.prototype.appendObject;
var appendFormatted = Firebug.ConsolePanel.prototype.appendFormatted;
var appendOpenGroup = Firebug.ConsolePanel.prototype.appendOpenGroup;
var appendCollapsedGroup = Firebug.ConsolePanel.prototype.appendCollapsedGroup;
var appendCloseGroup = Firebug.ConsolePanel.prototype.appendCloseGroup;

// ********************************************************************************************* //
// Local Helpers

function createDefaultReturnValueInstance()
{
    var proto = {
        __exposedProps__: {
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

Firebug.registerActivableModule(Firebug.Console);

return Firebug.Console;

// ********************************************************************************************* //
});
