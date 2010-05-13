/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(nsIPrefBranch2);

// ************************************************************************************************

var maxQueueRequests = 500;

// ************************************************************************************************

Firebug.ConsoleBase =
{
    log: function(object, context, className, rep, noThrottle, sourceLink)
    {
        dispatch(this.fbListeners,"log",[context, object, className, sourceLink]);
        return this.logRow(appendObject, object, context, className, rep, sourceLink, noThrottle);
    },

    logFormatted: function(objects, context, className, noThrottle, sourceLink)
    {
        dispatch(this.fbListeners,"logFormatted",[context, objects, className, sourceLink]);
        return this.logRow(appendFormatted, objects, context, className, null, sourceLink, noThrottle);
    },

    openGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        return this.logRow(appendOpenGroup, objects, context, className, rep, sourceLink, noThrottle);
    },

    closeGroup: function(context, noThrottle)
    {
        return this.logRow(appendCloseGroup, null, context, null, null, null, noThrottle, true);
    },

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = FirebugContext;

        if (FBTrace.DBG_ERRORS && !context)
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
                    clearDomplate(container.firstChild.nextSibling);
                    container.removeChild(container.firstChild.nextSibling);
                    panel.limit.limitInfo.totalCount++;
                    template.updateCounter(panel.limit);
                }
                dispatch(this.fbListeners, "onLogRowCreated", [panel , row]);
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
            context = FirebugContext;

        var panel = this.getPanel(context);
        panel.appendFormatted(args, row);
    },

    clear: function(context)
    {
        if (!context)
            context = FirebugContext;

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

var ActivableConsole = extend(Firebug.ActivableModule, Firebug.ConsoleBase);

Firebug.Console = extend(ActivableConsole,
{
    dispatchName: "console",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    showPanel: function(browser, panel)
    {
    },

    getFirebugConsoleElement: function(context, win)
    {
        var element = (win.document.body ? win.document.body : win.document.getElementsByTagName("body")[0]);
        if (!element)
            element = win.document.documentElement; // For non-HTML docs

        return element;

        // The rest of this code may be needed for the case where we have no JS but want to use the command line?
        if (!element.getAttribute("FirebugVersion"))
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("getFirebugConsoleElement forcing element");
            var elementForcer = "(function(){var r=null; try { r = window._getFirebugConsoleElement();}catch(exc){r=exc;} return r;})();";  // we could just add the elements here

            if (context.stopped)
                Firebug.Console.injector.evaluateConsoleScript(context);  // todo evaluate consoleForcer on stack
            else
                var r = Firebug.CommandLine.evaluateInWebPage(elementForcer, context, win);

            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("getFirebugConsoleElement forcing element result "+r, r);

            var element = win.document.getElementById("_firebugConsole");
            if (!element) // elementForce fails
            {
                if (FBTrace.DBG_ERRORS) FBTrace.sysout("console.getFirebugConsoleElement: no _firebugConsole in win:", win);
                Firebug.Console.logFormatted(["Firebug cannot find _firebugConsole element", r, win], context, "error", true);
            }
        }

        return element;
    },

    isReadyElsePreparing: function(context, win) // this is the only code that should call injector.attachIfNeeded
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.isReadyElsePreparing, win is " +
                (win?"an argument: ":"null, context.window: ") +
                (win?win.location:context.window.location), (win?win:context.window));

        if (win)
            return this.injector.attachIfNeeded(context, win);
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
    // extends ActivableModule

    initialize: function()
    {
        this.panelName = "console";

        Firebug.ActivableModule.initialize.apply(this, arguments);
        Firebug.Debugger.addListener(this);

    },

    enable: function()
    {
        if (Firebug.Console.isAlwaysEnabled())
            this.watchForErrors();
    },

    disable: function()
    {
        if (Firebug.Console.isAlwaysEnabled())
            this.unwatchForErrors();
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

        // else we saw no JS, so the reload warning it not needed.
        this.clearReloadWarning(context);
    },

    clearReloadWarning: function(context) // remove the warning about reloading.
    {
         if (context.consoleReloadWarning)
         {
             var panel = context.getPanel(this.panelName);
             panel.clearReloadWarning();
             delete context.consoleReloadWarning;
         }
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel(this.panelName);
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
         iterateWindows(context.window, function detachOneConsole(win)
         {
             Firebug.Console.injector.detachConsole(context, win);
         });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onPanelEnable: function(panelName)
    {
        if (panelName != this.panelName)  // we don't care about other panels
            return;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onPanelEnable**************");

        this.watchForErrors();
        Firebug.Debugger.addDependentModule(this); // we inject the console during JS compiles so we need jsd
    },

    onPanelDisable: function(panelName)
    {
        if (panelName != this.panelName)  // we don't care about other panels
            return;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onPanelDisable**************");

        Firebug.Debugger.removeDependentModule(this); // we inject the console during JS compiles so we need jsd
        this.unwatchForErrors();

        // Make sure possible errors coming from the page and displayed in the Firefox
        // status bar are removed.
        this.clear();
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

    watchForErrors: function()
    {
        Firebug.Errors.checkEnabled();
        $('fbStatusIcon').setAttribute("console", "on");
    },

    unwatchForErrors: function()
    {
        Firebug.Errors.checkEnabled();
        $('fbStatusIcon').removeAttribute("console");
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = FirebugContext;

        if (FBTrace.DBG_WINDOWS && !context) FBTrace.sysout("Console.logRow: no context \n");

        if (this.isAlwaysEnabled())
            return Firebug.ConsoleBase.logRow.apply(this, arguments);
    },
});

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

Firebug.ConsolePanel = function () {} // XXjjb attach Firebug so this panel can be extended.

Firebug.ConsolePanel.prototype = extend(Firebug.ActivablePanel,
{
    wasScrolledToBottom: false,
    messageCount: 0,
    lastLogTime: 0,
    groups: null,
    limit: null,

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
                FBTrace.sysout("console.append; wasScrolledToBottom " + this.wasScrolledToBottom);

            if (this.wasScrolledToBottom)
                scrollToBottom(this.panelNode);

            return row;
        }
    },

    clear: function()
    {
        if (this.panelNode)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("ConsolePanel.clear");
            clearNode(this.panelNode);
            this.insertLogLimit(this.context);
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
            limitPrefsTitle: $STRF("LimitPrefsTitle", [Firebug.prefDomain+".console.logLimit"])
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
        this.warningRow = this.append(appendObject, $STR("message.Reload to activate window console"), "info");
    },

    clearReloadWarning: function()
    {
        if (this.warningRow)
        {
            this.warningRow.parentNode.removeChild(this.warningRow);
            delete this.warningRow;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    appendObject: function(object, row, rep)
    {
        if (!rep)
            rep = Firebug.getRep(object);

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

    appendOpenGroup: function(objects, row, rep)
    {
        if (!this.groups)
            this.groups = [];

        setClass(row, "logGroup");
        setClass(row, "opened");

        var innerRow = this.createRow("logRow");
        setClass(innerRow, "logGroupLabel");
        if (rep)
            rep.tag.replace({"objects": objects}, innerRow);
        else
            this.appendFormatted(objects, innerRow, rep);
        row.appendChild(innerRow);
        dispatch(this.fbListeners, 'onLogRowCreated', [this, innerRow]);
        var groupBody = this.createRow("logGroupBody");
        row.appendChild(groupBody);
        groupBody.setAttribute('role', 'group');
        this.groups.push(groupBody);

        innerRow.addEventListener("mousedown", function(event)
        {
            if (isLeftClick(event))
            {
                var groupRow = event.currentTarget.parentNode;
                if (hasClass(groupRow, "opened"))
                {
                    removeClass(groupRow, "opened");
                    event.target.setAttribute('aria-expanded', 'false');
                }
                else
                {
                    setClass(groupRow, "opened");
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

        prefs.addObserver(Firebug.prefDomain, this, false);
    },

    initializeNode : function()
    {
        Firebug.ActivablePanel.initializeNode.apply(this, arguments);

        this.onScroller = bind(this.onScroll, this);
        this.panelNode.addEventListener("scroll", this.onScroller, true);

        this.onResizer = bind(this.onResize, this);
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
        prefs.removeObserver(Firebug.prefDomain, this, false);
    },

    show: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.panel show; wasScrolledToBottom: " +
                (state ? state.wasScrolledToBottom : "no prev state") +
                " " + this.context.getName(), state);

        var enabled = Firebug.Console.isAlwaysEnabled();
        if (enabled)
        {
            Firebug.Console.disabledPanelPage.hide(this);
            this.showCommandLine(true);
            this.showToolbarButtons("fbConsoleButtons", true);
            Firebug.chrome.setGlobalAttribute("cmd_togglePersistConsole", "checked",
                this.persistContent);

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
                scrollToBottom(this.panelNode);

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
        }
        else
        {
            this.hide(state);
            Firebug.Console.disabledPanelPage.show(this);
        }
    },

    hide: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.hide; wasScrolledToBottom: " +
                this.wasScrolledToBottom + " " + this.context.getName());

        if (state)
            state.wasScrolledToBottom = this.wasScrolledToBottom;

        this.showToolbarButtons("fbConsoleButtons", false);
        this.showCommandLine(false);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.hide; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", " + this.context.getName());
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
            FBTrace.sysout("console.destroy ------------------ wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", " + this.context.getName());

        Firebug.ActivablePanel.destroy.apply(this, arguments);  // must be called last
    },

    shouldBreakOnNext: function()
    {
        // xxxHonza: shouldn't the breakOnErrors be context related?
        // xxxJJB, yes, but we can't support it because we can't yet tell
        // which window the error is on.
        return Firebug.getPref(Firebug.servicePrefDomain, "breakOnErrors");
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? $STR("console.Disable Break On All Errors") :
            $STR("console.Break On All Errors"));
    },

    enablePanel: function(module)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.ConsolePanel.enablePanel; " + this.context.getName());

        Firebug.ActivablePanel.enablePanel.apply(this, arguments);

        this.showCommandLine(true);

        if (this.wasScrolledToBottom)
            scrollToBottom(this.panelNode);
    },

    disablePanel: function(module)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.ConsolePanel.disablePanel; " + this.context.getName());

        Firebug.ActivablePanel.disablePanel.apply(this, arguments);

        this.showCommandLine(false);
    },

    getOptionsMenuItems: function()
    {
        return [
            optionMenu("ShowJavaScriptErrors", "showJSErrors"),
            optionMenu("ShowJavaScriptWarnings", "showJSWarnings"),
            optionMenu("ShowCSSErrors", "showCSSErrors"),
            optionMenu("ShowXMLErrors", "showXMLErrors"),
            optionMenu("ShowXMLHttpRequests", "showXMLHttpRequests"),
            optionMenu("ShowChromeErrors", "showChromeErrors"),
            optionMenu("ShowChromeMessages", "showChromeMessages"),
            optionMenu("ShowExternalErrors", "showExternalErrors"),
            optionMenu("ShowNetworkErrors", "showNetworkErrors"),
            this.getShowStackTraceMenuItem(),
            this.getStrictOptionMenuItem(),
            "-",
            optionMenu("LargeCommandLine", "largeCommandLine")
        ];
    },

    getShowStackTraceMenuItem: function()
    {
        var menuItem = serviceOptionMenu("ShowStackTrace", "showStackTrace");
        if (FirebugContext && !Firebug.Debugger.isAlwaysEnabled())
            menuItem.disabled = true;
        return menuItem;
    },

    getStrictOptionMenuItem: function()
    {
        var strictDomain = "javascript.options";
        var strictName = "strict";
        var strictValue = prefs.getBoolPref(strictDomain+"."+strictName);
        return {label: "JavascriptOptionsStrict", type: "checkbox", checked: strictValue,
            command: bindFixed(Firebug.setPref, Firebug, strictDomain, strictName, !strictValue) };
    },

    getBreakOnMenuItems: function()
    {
        //xxxHonza: no BON options for now.
        /*return [
            optionMenu("console.option.Persist Break On Error", "persistBreakOnError")
        ];*/
       return [];
    },

    search: function(text)
    {
        if (!text)
            return;

        // Make previously visible nodes invisible again
        if (this.matchSet)
        {
            for (var i in this.matchSet)
                removeClass(this.matchSet[i], "matched");
        }

        this.matchSet = [];

        function findRow(node) { return getAncestorByClass(node, "logRow"); }
        var search = new TextSearch(this.panelNode, findRow);

        var logRow = search.find(text);
        if (!logRow)
        {
            dispatch(this.fbListeners, 'onConsoleSearchMatchFound', [this, text, []]);
            return false;
        }
        for (; logRow; logRow = search.findNext())
        {
            setClass(logRow, "matched");
            this.matchSet.push(logRow);
        }
        dispatch(this.fbListeners, 'onConsoleSearchMatchFound', [this, text, this.matchSet]);
        return true;
    },

    breakOnNext: function(breaking)
    {
        Firebug.setPref(Firebug.servicePrefDomain, "breakOnErrors", breaking);
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
            setClass(logRow, "matching");
            setClass(logRow, "matched");

            // Search after a delay because we must wait for a frame to be created for
            // the new logRow so that the finder will be able to locate it
            setTimeout(bindFixed(function()
            {
                if (this.searchFilter(this.searchText, logRow))
                    this.matchSet.push(logRow);
                else
                    removeClass(logRow, "matched");

                removeClass(logRow, "matching");

                if (scrolledToBottom)
                    scrollToBottom(this.panelNode);
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

        return finder.Find(text, searchRange, startPt, endPt) != null;
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
        var value = Firebug.getPref(Firebug.prefDomain, "console.logLimit");
        maxQueueRequests =  value ? value : maxQueueRequests;
    },

    showCommandLine: function(shouldShow)
    {
        if (shouldShow)
        {
            collapse(Firebug.chrome.$("fbCommandBox"), false);
            Firebug.CommandLine.setMultiLine(Firebug.largeCommandLine, Firebug.chrome);
        }
        else
        {
            // Make sure that entire content of the Console panel is hidden when
            // the panel is disabled.
            Firebug.CommandLine.setMultiLine(false, Firebug.chrome, Firebug.largeCommandLine);
            collapse(Firebug.chrome.$("fbCommandBox"), true);
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
            scrollToBottom(this.panelNode);
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
var appendCloseGroup = Firebug.ConsolePanel.prototype.appendCloseGroup;

// ************************************************************************************************

Firebug.registerActivableModule(Firebug.Console);
Firebug.registerPanel(Firebug.ConsolePanel);

// ************************************************************************************************
}});
