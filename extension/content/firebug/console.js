/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/firebug",
    "firebug/reps",
    "firebug/lib/locale",
    "arch/tools",
    "firebug/lib/events",
    "firebug/profiler",
    "firebug/search",
    "firebug/errors",
],
function(FBL, Firebug, FirebugReps, Locale, ToolsInterface, Events) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(nsIPrefBranch2);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const logTypes =
{
    "error": 1,
    "warning": 1,
    "info": 1,
    "debug": 1,
    "profile": 1,
    "table": 1,
    "group": 1,
    "command": 1,
    "stackTrace": 1,
    "log": 1,
    "dir": 1,
    "assert": 1,
    "spy": 1
};

// ************************************************************************************************

var maxQueueRequests = 500;

// ************************************************************************************************

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
        return this.logRow(appendFormatted, objects, context, className, null, sourceLink, noThrottle);
    },

    openGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        return this.logRow(appendOpenGroup, objects, context, className, rep, sourceLink, noThrottle);
    },

    openCollapsedGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        return this.logRow(appendCollapsedGroup, objects, context, className, rep, sourceLink, noThrottle);
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
                var template = Firebug.NetMonitor.NetLimit;

                while (container.childNodes.length > maxQueueRequests + 1)
                {
                    FBL.clearDomplate(container.firstChild.nextSibling);
                    container.removeChild(container.firstChild.nextSibling);
                    panel.limit.limitInfo.totalCount++;
                    template.updateCounter(panel.limit);
                }
                Events.dispatch(this.fbListeners, "onLogRowCreated", [panel , row]);
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

// ************************************************************************************************

var ActivableConsole = FBL.extend(Firebug.ActivableModule, Firebug.ConsoleBase);

Firebug.Console = FBL.extend(ActivableConsole,
{
    dispatchName: "console",
    toolName: "console",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    showPanel: function(browser, panel)
    {
    },

    isReadyElsePreparing: function(context, win) // this is the only code that should call injector.attachIfNeeded
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.isReadyElsePreparing, win is " +
                (win?"an argument: ":"null, context.window: ") +
                (win?win.location:context.window.location), (win?win:context.window));

        if (FBL.isXMLPrettyPrint(context, win))
            return false;

        if (win)
        {
            return this.injector.attachIfNeeded(context, win);
        }
        else
        {
            var attached = true;
            for (var i = 0; i < context.windows.length; i++)
                attached = attached && this.injector.attachIfNeeded(context, context.windows[i]);
            // already in the list above attached = attached && this.injector.attachIfNeeded(context, context.window);
            if (context.windows.indexOf(context.window) == -1)
                FBTrace.sysout("isReadyElsePreparing ***************** context.window not in context.windows");
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("console.isReadyElsePreparing attached to "+context.windows.length+" and returns "+attached);
            return attached;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        Firebug.consoleFilterTypes = "";

        Firebug.ActivableModule.initialize.apply(this, arguments);

        this.asTool = new ToolsInterface.Browser.Tool('console');
        ToolsInterface.browser.addListener(this);
        ToolsInterface.browser.registerTool(this.asTool);

        this.syncFilterButtons(Firebug.chrome);
    },

    shutdown: function()
    {
        ToolsInterface.browser.removeListener(this);
        ToolsInterface.browser.unregisterTool(this.asTool);

        Firebug.ActivableModule.shutdown.apply(this, arguments);
    },

    initContext: function(context, persistedState)
    {
        Firebug.ActivableModule.initContext.apply(this, arguments);
        context.consoleReloadWarning = true;  // mark as need to warn.
    },

    loadedContext: function(context)
    {
        for (var url in context.sourceFileMap)
            return;  // if there are any sourceFiles, then do nothing

        // Inject console handler if not injected yet. It's injected only in the case that
        // the page has JS (and thus may call console) and Firebug has been activated after
        // the first JS call (and thus we have not already injected).
        if (!this.injector.isAttached(context, context.window) && !context.jsDebuggerCalledUs)
            this.isReadyElsePreparing(context);

        // else we saw no JS, so the reload warning is not needed.
        this.clearReloadWarning(context);
    },

    clearReloadWarning: function(context) // remove the warning about reloading.
    {
        if (context.consoleReloadWarning)
        {
            var panel = context.getPanel("console");
            if (panel)
            {
                panel.clearReloadWarning();
                delete context.consoleReloadWarning;
            }
        }
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel("console");
        panel.persistContent = panel.persistContent ? false : true;
        Firebug.chrome.setGlobalAttribute("cmd_togglePersistConsole", "checked", panel.persistContent);
    },

    showContext: function(browser, context)
    {
        Firebug.chrome.setGlobalAttribute("cmd_clearConsole", "disabled", !context);

        Firebug.ActivableModule.showContext.apply(this, arguments);
    },

    destroyContext: function(context, persistedState)
    {
        FBL.iterateWindows(context.window, function detachOneConsole(win)
        {
            Firebug.CommandLine.injector.detachCommandLine(context, win);  // remove this first since it needs the console
            Firebug.Console.injector.detachConsole(context, win);
        });
    },

    unwatchWindow: function(context, win)
    {
        Firebug.Console.injector.detachConsole(context, win);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extend ActivableModule

    onObserverChange: function(observer)
    {
        if (this.isAlwaysEnabled())
        {
            this.watchForErrors();

            // we inject the console during JS compiles so we need jsd
            Firebug.Debugger.addObserver(this);
        }
        else
        {
            this.unwatchForErrors();
            Firebug.Debugger.removeObserver(this);

            // Make sure possible errors coming from the page and displayed in the Firefox
            // status bar are removed.
            this.clear();
        }
    },

    onSuspendFirebug: function()
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onSuspendFirebug\n");

        if (Firebug.Console.isAlwaysEnabled())
            this.unwatchForErrors();
    },

    onResumeFirebug: function()
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onResumeFirebug\n");

        if (Firebug.Console.isAlwaysEnabled())
            this.watchForErrors();
    },

    onToggleFilter: function(context, filterType)
    {
        if (!context)
            context = Firebug.currentContext;

        // xxxHonza: what is the issue number?
        /* Preparation for multiple filters
        if (filterType == "")
            Firebug.consoleFilterTypes = "";
        else
        {
            var index = Firebug.consoleFilterTypes.indexOf(filterType);
            if (index >= 0)
                Firebug.consoleFilterTypes = Firebug.consoleFilterTypes.substr(0, index-1) +
                    Firebug.consoleFilterTypes.substr(index+filterType.length);
            else
                Firebug.consoleFilterTypes += " " + filterType;
        }
        */

        Firebug.consoleFilterTypes = filterType;

        Firebug.Options.set("consoleFilterTypes", Firebug.consoleFilterTypes);

        var panel = this.getPanel(context, true);
        if (panel)
        {
            panel.setFilter(Firebug.consoleFilterTypes);
            Firebug.Search.update(context);
        }

    },

    syncFilterButtons: function(chrome)
    {
        if (Firebug.consoleFilterTypes == "")
        {
            var button = chrome.$("fbConsoleFilter-all");
            button.checked = true;
        }
        else
        {
            var filterTypes = Firebug.consoleFilterTypes.split(" ");

            for (var type = 0; type < filterTypes.length; type++)
            {
                var button = chrome.$("fbConsoleFilter-" + filterTypes[type]);
                button.checked = true;
            }
        }
    },

    watchForErrors: function()
    {
        Firebug.Errors.checkEnabled();
        FBL.$('firebugStatus').setAttribute("console", "on");
    },

    unwatchForErrors: function()
    {
        Firebug.Errors.checkEnabled();
        FBL.$('firebugStatus').removeAttribute("console");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Firebug.Debugger listener

    onMonitorScript: function(context, frame)
    {
        Firebug.Console.log(frame, context);
    },

    onFunctionCall: function(context, frame, depth, calling)
    {
        if (calling)
            Firebug.Console.openGroup([frame, "depth:"+depth], context);
        else
            Firebug.Console.closeGroup(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BTI

    /**
     * A previously enabled tool becomes active and sends us an event.
     */
    onActivateTool: function(toolname, active)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Console.onActivateTool "+toolname+" = "+active);

        if (toolname === 'script')  // Console depends on script to get injected (for now)
        {
            if (this.isAlwaysEnabled())
            {
                this.asTool.setActive(active);  // then track the activation of the debugger;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = Firebug.currentContext;

        if (FBTrace.DBG_WINDOWS && !context)
            FBTrace.sysout("Console.logRow: no context \n");

        if (this.isAlwaysEnabled())
            return Firebug.ConsoleBase.logRow.apply(this, arguments);
    },
});

// ************************************************************************************************

Firebug.ConsoleListener =
{
    log: function(context, object, className, sourceLink)
    {
    },

    logFormatted: function(context, objects, className, sourceLink)
    {
    }
};

// ************************************************************************************************

Firebug.ConsolePanel = function () {};

Firebug.ConsolePanel.prototype = FBL.extend(Firebug.ActivablePanel,
{
    wasScrolledToBottom: false,
    messageCount: 0,
    lastLogTime: 0,
    groups: null,
    limit: null,
    order: 10,

    append: function(appender, objects, className, rep, sourceLink, noRow)
    {
        var container = this.getTopContainer();

        if (noRow)
        {
            appender.apply(this, [objects]);
        }
        else
        {
            var row = this.createRow("logRow", className);

            appender.apply(this, [objects, row, rep]);

            if (sourceLink)
                FirebugReps.SourceLink.tag.append({object: sourceLink}, row);

            container.appendChild(row);

            this.filterLogRow(row, this.wasScrolledToBottom);

            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("console.append; wasScrolledToBottom " + this.wasScrolledToBottom+" "+row.textContent);

            if (this.wasScrolledToBottom)
                FBL.scrollToBottom(this.panelNode);

            return row;
        }
    },

    clear: function()
    {
        if (this.panelNode)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("ConsolePanel.clear");
            FBL.clearNode(this.panelNode);
            this.insertLogLimit(this.context);

            FBL.scrollToBottom(this.panelNode);
            this.wasScrolledToBottom = true;

            // Don't forget to clear opened groups, if any.
            this.groups = null;
        }
    },

    insertLogLimit: function()
    {
        // Create limit row. This row is the first in the list of entries
        // and initially hidden. It's displayed as soon as the number of
        // entries reaches the limit.
        var row = this.createRow("limitRow");

        var limitInfo = {
            totalCount: 0,
            limitPrefsTitle: Locale.$STRF("LimitPrefsTitle", [Firebug.Options.prefDomain+".console.logLimit"])
        };

        var netLimitRep = Firebug.NetMonitor.NetLimit;
        var nodes = netLimitRep.createTable(row, limitInfo);

        this.limit = nodes[1];

        var container = this.panelNode;
        container.insertBefore(nodes[0], container.firstChild);
    },

    insertReloadWarning: function()
    {
        // put the message in, we will clear if the window console is injected.
        this.warningRow = this.append(appendObject, Locale.$STR("message.Reload to activate window console"), "info");
    },

    clearReloadWarning: function()
    {
        if (this.warningRow && this.warningRow.parentNode)
        {
            this.warningRow.parentNode.removeChild(this.warningRow);
            delete this.warningRow;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    appendObject: function(object, row, rep)
    {
        if (!rep)
            rep = Firebug.getRep(object, this.context);

        // Don't forget to pass the template itself as the 'self' parameter so, it's used
        // by domplate as the 'subject' for the generation. Note that the primary purpose
        // of the subject is to provide a context object ('with (subject) {...}') for data that
        // are dynamically consumed during the rendering process.
        // This allows to derive new templates from an existing ones, without breaking
        // the default subject set within domplate() function.
        return rep.tag.append({object: object}, row, rep);
    },

    appendFormatted: function(objects, row, rep)
    {
        if (!objects || !objects.length)
            return;

        function logText(text, row)
        {
            var node = row.ownerDocument.createTextNode(text);
            row.appendChild(node);
        }

        var format = objects[0];
        var objIndex = 0;

        if (typeof(format) != "string")
        {
            format = "";
            objIndex = -1;
        }
        else  // a string
        {
            if (objects.length === 1) // then we have only a string...
            {
                if (format.length < 1) { // ...and it has no characters.
                    logText("(an empty string)", row);
                    return;
                }
            }
        }

        var parts = parseFormat(format);
        var trialIndex = objIndex;
        for (var i= 0; i < parts.length; i++)
        {
            var part = parts[i];
            if (part && typeof(part) == "object")
            {
                if (++trialIndex > objects.length)  // then too few parameters for format, assume unformatted.
                {
                    format = "";
                    objIndex = -1;
                    parts.length = 0;
                    break;
                }
            }

        }
        for (var i = 0; i < parts.length; ++i)
        {
            var part = parts[i];
            if (part && typeof(part) == "object")
            {
                var object = objects[++objIndex];
                if (part.type == "%c")
                    row.setAttribute("style", object.toString());
                else if (typeof(object) != "undefined")
                    this.appendObject(object, row, part.rep);
                else
                    this.appendObject(part.type, row, FirebugReps.Text);
            }
            else
                FirebugReps.Text.tag.append({object: part}, row);
        }

        for (var i = objIndex+1; i < objects.length; ++i)
        {
            logText(" ", row);
            var object = objects[i];
            if (typeof(object) == "string")
                FirebugReps.Text.tag.append({object: object}, row);
            else
                this.appendObject(object, row);
        }
    },

    appendCollapsedGroup: function(objects, row, rep)
    {
        this.appendOpenGroup(objects, row, rep);
        FBL.removeClass(row, "opened");
    },

    appendOpenGroup: function(objects, row, rep)
    {
        if (!this.groups)
            this.groups = [];

        FBL.setClass(row, "logGroup");
        FBL.setClass(row, "opened");

        var innerRow = this.createRow("logRow");
        FBL.setClass(innerRow, "logGroupLabel");

        // Custom rep is used in place of group label.
        if (rep)
            rep.tag.replace({"object": objects}, innerRow);
        else
            this.appendFormatted(objects, innerRow, rep);

        row.appendChild(innerRow);
        Events.dispatch(this.fbListeners, 'onLogRowCreated', [this, innerRow]);

        // Create group body, which is displayed when the group is expanded.
        var groupBody = this.createRow("logGroupBody");
        row.appendChild(groupBody);
        groupBody.setAttribute('role', 'group');
        this.groups.push(groupBody);

        // Expand/collapse logic.
        innerRow.addEventListener("mousedown", function(event)
        {
            if (Events.isLeftClick(event))
            {
                var groupRow = event.currentTarget.parentNode;
                if (FBL.hasClass(groupRow, "opened"))
                {
                    FBL.removeClass(groupRow, "opened");
                    event.target.setAttribute('aria-expanded', 'false');
                }
                else
                {
                    FBL.setClass(groupRow, "opened");
                    event.target.setAttribute('aria-expanded', 'true');
                }
            }
        }, false);
    },

    appendCloseGroup: function(object, row, rep)
    {
        if (this.groups)
            this.groups.pop();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "console",
    searchable: true,
    breakable: true,
    editable: false,
    enableA11y: true,

    initialize: function()
    {
        Firebug.ActivablePanel.initialize.apply(this, arguments);  // loads persisted content

        if (!this.persistedContent && Firebug.Console.isAlwaysEnabled())
        {
            this.insertLogLimit(this.context);

            // Initialize log limit and listen for changes.
            this.updateMaxLimit();

            if (this.context.consoleReloadWarning)  // we have not yet injected the console
                this.insertReloadWarning();
        }

        prefs.addObserver(Firebug.Options.prefDomain, this, false);  // TODO use optins.js
    },

    destroy: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.destroy; wasScrolledToBottom: " +
                this.wasScrolledToBottom + " " + this.context.getName());

        if (state)
            state.wasScrolledToBottom = this.wasScrolledToBottom;

        // If we are profiling and reloading, save the profileRow for the new context
        if (this.context.profileRow && this.context.profileRow.ownerDocument)
        {
            this.context.profileRow.parentNode.removeChild(this.context.profileRow);
            state.profileRow = this.context.profileRow;
        }

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.destroy; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", " + this.context.getName());

        Firebug.ActivablePanel.destroy.apply(this, arguments);  // must be called last
    },

    initializeNode : function()
    {
        Firebug.ActivablePanel.initializeNode.apply(this, arguments);

        this.onScroller = FBL.bind(this.onScroll, this);
        this.panelNode.addEventListener("scroll", this.onScroller, true);

        this.onResizer = FBL.bind(this.onResize, this);
        this.resizeEventTarget = Firebug.chrome.$('fbContentBox');
        this.resizeEventTarget.addEventListener("resize", this.onResizer, true);
    },

    destroyNode : function()
    {
        Firebug.ActivablePanel.destroyNode.apply(this, arguments);

        if (this.onScroller)
            this.panelNode.removeEventListener("scroll", this.onScroller, true);

        this.resizeEventTarget.removeEventListener("resize", this.onResizer, true);
    },

    shutdown: function()
    {
        prefs.removeObserver(Firebug.Options.prefDomain, this, false); // TODO remove to options.js
    },

    show: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.panel show; wasScrolledToBottom: " +
                (state ? state.wasScrolledToBottom : "no prev state") +
                " " + this.context.getName(), state);

        this.showCommandLine(true);
        this.showToolbarButtons("fbConsoleButtons", true);

        this.setFilter(Firebug.consoleFilterTypes);

        Firebug.chrome.setGlobalAttribute("cmd_togglePersistConsole", "checked",
            this.persistContent);

        this.showPanel(state);
    },

    showPanel: function(state)
    {
        var wasScrolledToBottom;
        if (state)
            wasScrolledToBottom = state.wasScrolledToBottom;

        if (typeof(wasScrolledToBottom) == "boolean")
        {
            this.wasScrolledToBottom = wasScrolledToBottom;
            delete state.wasScrolledToBottom;
        }
        else
        {
            // If the previous state doesn't says where to scroll,
            // scroll to the bottom by default.
            this.wasScrolledToBottom = true;
        }

        if (this.wasScrolledToBottom)
            FBL.scrollToBottom(this.panelNode);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.show; wasScrolledToBottom: " +
               this.wasScrolledToBottom + ", " + this.context.getName());

        if (state && state.profileRow) // then we reloaded while profiling
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("console.show; state.profileRow:", state.profileRow);

            this.context.profileRow = state.profileRow;
            this.panelNode.appendChild(state.profileRow);
            delete state.profileRow;
        }
    },

    hide: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.hide; wasScrolledToBottom: " +
                this.wasScrolledToBottom + " " + this.context.getName());

        if (state)
            state.wasScrolledToBottom = this.wasScrolledToBottom;

        this.showCommandLine(false);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.hide; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", " + this.context.getName());
    },

    updateOption: function(name, value)
    {
        if (name == "consoleFilterTypes")
        {
            Firebug.Console.syncFilterButtons(Firebug.chrome);
            for (var i = 0; i < Firebug.TabWatcher.contexts.length; ++i)
            {
                var context = Firebug.TabWatcher.contexts[i];
                Firebug.Console.onToggleFilter(context, value);
            }
        }
    },

    shouldBreakOnNext: function()
    {
        // xxxHonza: shouldn't the breakOnErrors be context related?
        // xxxJJB, yes, but we can't support it because we can't yet tell
        // which window the error is on.
        return Firebug.Options.get("breakOnErrors");
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("console.Disable Break On All Errors") :
            Locale.$STR("console.Break On All Errors"));
    },

    /**
     * Support for panel activation.
     */
    onActivationChanged: function(enable)
    {
        if (FBTrace.DBG_CONSOLE || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("console.ConsolePanel.onActivationChanged; " + enable);

        if (enable)
            Firebug.Console.addObserver(this);
        else
            Firebug.Console.removeObserver(this);
    },

    getOptionsMenuItems: function()
    {
        return [
            FBL.optionMenu("ShowJavaScriptErrors", "showJSErrors"),
            FBL.optionMenu("ShowJavaScriptWarnings", "showJSWarnings"),
            FBL.optionMenu("ShowCSSErrors", "showCSSErrors"),
            FBL.optionMenu("ShowXMLErrors", "showXMLErrors"),
            FBL.optionMenu("ShowXMLHttpRequests", "showXMLHttpRequests"),
            FBL.optionMenu("ShowChromeErrors", "showChromeErrors"),
            FBL.optionMenu("ShowChromeMessages", "showChromeMessages"),
            FBL.optionMenu("ShowExternalErrors", "showExternalErrors"),
            FBL.optionMenu("ShowNetworkErrors", "showNetworkErrors"),
            this.getShowStackTraceMenuItem(),
            this.getStrictOptionMenuItem(),
            "-",
            FBL.optionMenu("Command_Editor", "largeCommandLine"),
            FBL.optionMenu("commandLineShowCompleterPopup", "commandLineShowCompleterPopup")
        ];
    },

    getShowStackTraceMenuItem: function()
    {
        var menuItem = FBL.optionMenu("ShowStackTrace", "showStackTrace");
        if (Firebug.currentContext && !Firebug.Debugger.isAlwaysEnabled())
            menuItem.disabled = true;
        return menuItem;
    },

    getStrictOptionMenuItem: function()
    {
        var strictDomain = "javascript.options";
        var strictName = "strict";
        var strictValue = prefs.getBoolPref(strictDomain+"."+strictName);
        return {label: "JavascriptOptionsStrict", type: "checkbox", checked: strictValue,
            command: FBL.bindFixed(Firebug.Options.setPref, Firebug, strictDomain, strictName, !strictValue) };
    },

    getBreakOnMenuItems: function()
    {
       return [];
    },

    setFilter: function(filterTypes)
    {
        var panelNode = this.panelNode;
        for (var type in logTypes)
        {
            // Different types of errors and warnings are combined for filtering
            if (filterTypes == "all" || filterTypes == "" || filterTypes.indexOf(type) != -1 ||
                (filterTypes.indexOf("error") != -1 && (type == "error" || type == "errorMessage")) ||
                (filterTypes.indexOf("warning") != -1 && (type == "warn" || type == "warningMessage")))
            {
                FBL.removeClass(panelNode, "hideType-"+type);
            }
            else
                FBL.setClass(panelNode, "hideType-"+type);
        }
    },

    search: function(text)
    {
        // Make previously visible nodes invisible again
        if (this.matchSet)
        {
            for (var i in this.matchSet)
                FBL.removeClass(this.matchSet[i], "matched");
        }

        if (!text)
            return;

        this.matchSet = [];

        function findRow(node) { return FBL.getAncestorByClass(node, "logRow"); }
        var search = new FBL.TextSearch(this.panelNode, findRow);

        var logRow = search.find(text);
        if (!logRow)
        {
            Events.dispatch(this.fbListeners, 'onConsoleSearchMatchFound', [this, text, []]);
            return false;
        }
        for (; logRow; logRow = search.findNext())
        {
            FBL.setClass(logRow, "matched");
            this.matchSet.push(logRow);
        }
        Events.dispatch(this.fbListeners, 'onConsoleSearchMatchFound', [this, text, this.matchSet]);
        return true;
    },

    breakOnNext: function(breaking)
    {
        Firebug.Options.set("breakOnErrors", breaking);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // private

    createRow: function(rowName, className)
    {
        var elt = this.document.createElement("div");
        elt.className = rowName + (className ? " " + rowName + "-" + className : "");
        return elt;
    },

    getTopContainer: function()
    {
        if (this.groups && this.groups.length)
            return this.groups[this.groups.length-1];
        else
            return this.panelNode;
    },

    filterLogRow: function(logRow, scrolledToBottom)
    {
        if (this.searchText)
        {
            FBL.setClass(logRow, "matching");
            FBL.setClass(logRow, "matched");

            // Search after a delay because we must wait for a frame to be created for
            // the new logRow so that the finder will be able to locate it
            setTimeout(FBL.bindFixed(function()
            {
                if (this.searchFilter(this.searchText, logRow))
                    this.matchSet.push(logRow);
                else
                    FBL.removeClass(logRow, "matched");

                FBL.removeClass(logRow, "matching");

                if (scrolledToBottom)
                    FBL.scrollToBottom(this.panelNode);
            }, this), 100);
        }
    },

    searchFilter: function(text, logRow)
    {
        var count = this.panelNode.childNodes.length;
        var searchRange = this.document.createRange();
        searchRange.setStart(this.panelNode, 0);
        searchRange.setEnd(this.panelNode, count);

        var startPt = this.document.createRange();
        startPt.setStartBefore(logRow);

        var endPt = this.document.createRange();
        endPt.setStartAfter(logRow);

        return FBL.finder.Find(text, searchRange, startPt, endPt) != null;
    },

    // nsIPrefObserver
    observe: function(subject, topic, data)
    {
        // We're observing preferences only.
        if (topic != "nsPref:changed")
          return;

        // xxxHonza check this out.
        var prefDomain = "Firebug.extension.";
        var prefName = data.substr(prefDomain.length);
        if (prefName == "console.logLimit")
            this.updateMaxLimit();
    },

    updateMaxLimit: function()
    {
        var value = Firebug.Options.get("console.logLimit");
        maxQueueRequests =  value ? value : maxQueueRequests;
    },

    showCommandLine: function(shouldShow)
    {
        if (shouldShow)
        {
            FBL.collapse(Firebug.chrome.$("fbCommandBox"), false);
            Firebug.CommandLine.setMultiLine(Firebug.largeCommandLine, Firebug.chrome);
        }
        else
        {
            // Make sure that entire content of the Console panel is hidden when
            // the panel is disabled.
            Firebug.CommandLine.setMultiLine(false, Firebug.chrome, Firebug.largeCommandLine);
            FBL.collapse(Firebug.chrome.$("fbCommandBox"), true);
        }
    },

    onScroll: function(event)
    {
        // Update the scroll position flag if the position changes.
        this.wasScrolledToBottom = FBL.isScrolledToBottom(this.panelNode);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onScroll; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", wasScrolledToBottom: " +
                this.context.getName(), event);
    },

    onResize: function(event)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onResize; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", offsetHeight: " + this.panelNode.offsetHeight +
                ", scrollTop: " + this.panelNode.scrollTop + ", scrollHeight: " +
                this.panelNode.scrollHeight + ", " + this.context.getName(), event);

        if (this.wasScrolledToBottom)
            FBL.scrollToBottom(this.panelNode);
    },
});

// ************************************************************************************************

function parseFormat(format)
{
    var parts = [];
    if (format.length <= 0)
        return parts;

    var reg = /((^%|.%)(\d+)?(\.)([a-zA-Z]))|((^%|.%)([a-zA-Z]))/;
    for (var m = reg.exec(format); m; m = reg.exec(format))
    {
        if (m[0].substr(0, 2) == "%%")
        {
            parts.push(format.substr(0, m.index));
            parts.push(m[0].substr(1));
        }
        else
        {
            var type = m[8] ? m[8] : m[5];
            var precision = m[3] ? parseInt(m[3]) : (m[4] == "." ? -1 : 0);

            var rep = null;
            switch (type)
            {
                case "s":
                    rep = FirebugReps.Text;
                    break;
                case "f":
                case "i":
                case "d":
                    rep = FirebugReps.Number;
                    break;
                case "o":
                case "c":
                    rep = null;
                    break;
            }

            parts.push(format.substr(0, m[0][0] == "%" ? m.index : m.index+1));
            parts.push({rep: rep, precision: precision, type: ("%" + type)});
        }

        format = format.substr(m.index+m[0].length);
    }

    parts.push(format);
    return parts;
}

// ************************************************************************************************

var appendObject = Firebug.ConsolePanel.prototype.appendObject;
var appendFormatted = Firebug.ConsolePanel.prototype.appendFormatted;
var appendOpenGroup = Firebug.ConsolePanel.prototype.appendOpenGroup;
var appendCollapsedGroup = Firebug.ConsolePanel.prototype.appendCollapsedGroup;
var appendCloseGroup = Firebug.ConsolePanel.prototype.appendCloseGroup;

// ************************************************************************************************
// Registration

Firebug.registerActivableModule(Firebug.Console);
Firebug.registerPanel(Firebug.ConsolePanel);

return Firebug.Console;

// ************************************************************************************************
});
