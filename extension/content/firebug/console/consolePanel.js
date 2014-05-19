/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/search",
    "firebug/lib/options",
    "firebug/lib/wrapper",
    "firebug/lib/xpcom",
    "firebug/chrome/menu",
    "firebug/chrome/reps",
    "firebug/chrome/searchBox",
    "firebug/chrome/panelNotification",
    "firebug/chrome/activablePanel",
    "firebug/console/commandLine",
    "firebug/console/errorMessageObj",
    "firebug/debugger/breakpoints/breakOnError",
],
function(Firebug, FBTrace, Obj, Domplate, Locale, Events, Css, Dom, Search, Options, Wrapper,
    Xpcom, Menu, FirebugReps, SearchBox, PanelNotification, ActivablePanel, CommandLine,
    ErrorMessageObj, BreakOnError) {

"use strict";

// ********************************************************************************************* //
// Resources

// Firebug wiki: https://getfirebug.com/wiki/index.php/Console_Panel

// ********************************************************************************************* //
// Constants

var {domplate, DIV, SPAN, TD, TR, TABLE, TBODY} = Domplate;

var reAllowedCss = /^(-moz-)?(background|border|color|font|line|margin|padding|text)/;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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

var Trace = FBTrace.to("DBG_CONSOLE");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// ConsolePanel Implementation

/**
 * @panel This object represents the Console panel.
 */
function ConsolePanel()
{
}

ConsolePanel.prototype = Obj.extend(ActivablePanel,
/** @lends ConsolePanel */
{
    dispatchName: "ConsolePanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    template: domplate(
    {
        logRowTag:
            DIV({"class": "$className", role: "listitem"},
                DIV(
                    DIV({"class": "logCounter"},
                        SPAN({"class": "logCounterValue"})
                    ),
                    DIV({"class": "logContent"})
                )
            ),

        limitTag:
            DIV({"class": "panelNotificationBox collapsed"},
                TABLE({width: "100%", cellpadding: 0, cellspacing: 0},
                    TBODY(
                        TR(
                            TD({"class": "consolePanelNotification"})
                        )
                    )
                )
            ),
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

    name: "console",
    searchable: true,
    breakable: true,
    editable: false,
    enableA11y: true,

    wasScrolledToBottom: false,
    messageCount: 0,
    lastLogTime: 0,
    groups: null,
    limit: null,
    order: 10,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function()
    {
        // Loads persisted content.
        ActivablePanel.initialize.apply(this, arguments);

        this.filterMatchSet = [];

        if (!this.persistedContent && Firebug.Console.isAlwaysEnabled())
            this.insertLogLimit(this.context);

        // Update visibility of stack frame arguments.
        var name = "showStackFrameArguments";
        this.updateOption(name, Options.get(name));

        // The Console panel displays error breakpoints and so, its UI must be updated
        // when a new error-breakpoint is created or removed. It also listens to
        // debugger tool to update BON error UI.
        this.context.getTool("debugger").addListener(this);

        // Listen for set filters, so the panel is properly updated when needed
        Firebug.Console.addListener(this);

        Firebug.registerUIListener(this);

        if (Firebug.Console.isEnabled())
            Firebug.Console.attachConsoleToWindows(this.context);
    },

    destroy: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.destroy; wasScrolledToBottom: " +
                this.wasScrolledToBottom + " " + this.context.getName());

        if (state)
            state.wasScrolledToBottom = this.wasScrolledToBottom;

        // xxxHonza: could we move this into "firebug/console/commands/profiler" module?
        // If we are profiling and reloading, save the profileRow for the new context
        if (this.context.profileRow && this.context.profileRow.ownerDocument)
        {
            this.context.profileRow.parentNode.removeChild(this.context.profileRow);
            state.profileRow = this.context.profileRow;
            state.profiling = this.context.profiling;
        }

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.destroy; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", " + this.context.getName());

        this.context.getTool("debugger").removeListener(this);

        Firebug.Console.removeListener(this);

        Firebug.unregisterUIListener(this);

        ActivablePanel.destroy.apply(this, arguments);  // must be called last
    },

    initializeNode: function()
    {
        ActivablePanel.initializeNode.apply(this, arguments);

        this.onScroller = Obj.bind(this.onScroll, this);
        Events.addEventListener(this.panelNode, "scroll", this.onScroller, true);

        this.onResizer = Obj.bind(this.onResize, this);
        this.resizeEventTarget = Firebug.chrome.$('fbContentBox');
        Events.addEventListener(this.resizeEventTarget, "resize", this.onResizer, true);
    },

    destroyNode: function()
    {
        ActivablePanel.destroyNode.apply(this, arguments);

        if (this.onScroller)
            Events.removeEventListener(this.panelNode, "scroll", this.onScroller, true);

        Events.removeEventListener(this.resizeEventTarget, "resize", this.onResizer, true);
    },

    show: function(state)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.panel show; wasScrolledToBottom: " +
                (state ? state.wasScrolledToBottom : "no prev state") +
                " " + this.context.getName(), state);

        this.showCommandLine(true);

        // Is true when the user has switched to a different panel.
        // Is false when they has switched to a different Firefox tab with the same Firebug panel.
        // Note: is also true when the user opens Firebug for the first time on the webpage
        // (previousPanelName is undefined in this case).
        var hasSwitchedPanel = (this.context.panelName !== this.context.previousPanelName);

        // Cover these three cases:
        // - Opening Firebug should focus Command Line (issue 6620)
        // - Switching to Console panel without Firebug being focused should focus the Command Line
        //    (issue 6619)
        // - The Command Line in detached mode should not steal the focus when switching tabs
        //    (issue 7465)
        //
        // xxxFlorent: FIXME? Opening Firebug twice in detached mode on the same webpage doesn't
        // give the Focus to the Command Line.
        if (this.context.window.document.readyState === "complete" &&
            !(Firebug.isDetached() && !hasSwitchedPanel))
        {
            CommandLine.focus(this.context);
        }

        this.showToolbarButtons("fbConsoleButtons", true);

        if (!this.filterTypes)
            this.setFilter(Options.get("consoleFilterTypes").split(" "));

        Firebug.chrome.setGlobalAttribute("cmd_firebug_togglePersistConsole", "checked",
            this.persistContent);

        this.showPanel(state);
    },

    showPanel: function(state)
    {
        var wasScrolledToBottom;

        if (state)
            wasScrolledToBottom = state.wasScrolledToBottom;

        if (typeof wasScrolledToBottom == "boolean")
        {
            this.wasScrolledToBottom = wasScrolledToBottom;
            delete state.wasScrolledToBottom;
        }
        else if (typeof this.wasScrolledToBottom != "boolean")
        {
            // If the previous state doesn't says where to scroll,
            // scroll to the bottom by default.
            this.wasScrolledToBottom = true;
        }

        if (this.wasScrolledToBottom)
            Dom.scrollToBottom(this.panelNode);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.show; wasScrolledToBottom: " +
                this.wasScrolledToBottom + ", " + this.context.getName());

        // xxxHonza: could we move this into "firebug/console/commands/profiler" module?
        // then we reloaded while profiling
        if (state && state.profileRow)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("console.show; state.profileRow:", state.profileRow);

            this.context.profileRow = state.profileRow;
            this.panelNode.appendChild(state.profileRow);

            this.context.profiling = state.profiling;

            delete state.profileRow;
            delete state.profiling;
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
        if (name == "showStackFrameArguments")
        {
            if (value)
                Css.removeClass(this.panelNode, "hideArguments");
            else
                Css.setClass(this.panelNode, "hideArguments");
        }
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
            Menu.optionMenu("ShowJavaScriptErrors", "showJSErrors",
                "console.option.tip.Show_JavaScript_Errors"),
            Menu.optionMenu("ShowJavaScriptWarnings", "showJSWarnings",
                "console.option.tip.Show_JavaScript_Warnings"),
            Menu.optionMenu("ShowCSSErrors", "showCSSErrors",
                "console.option.tip.Show_CSS_Errors"),
            Menu.optionMenu("ShowXMLHTMLErrors", "showXMLErrors",
                "console.option.tip.Show_XML_HTML_Errors"),
            Menu.optionMenu("ShowXMLHttpRequests", "showXMLHttpRequests",
                "console.option.tip.Show_XMLHttpRequests"),
            Menu.optionMenu("ShowChromeErrors", "showChromeErrors",
                "console.option.tip.Show_System_Errors"),
            Menu.optionMenu("ShowChromeMessages", "showChromeMessages",
                "console.option.tip.Show_System_Messages"),
            Menu.optionMenu("ShowNetworkErrors", "showNetworkErrors",
                "console.option.tip.Show_Network_Errors"),
            this.getShowStackTraceMenuItem(),
            this.getStrictOptionMenuItem(),
            Menu.optionMenu("console.option.Group_Log_Messages", "console.groupLogMessages",
                "console.option.tip.Group_Log_Messages"),
            "-",
            Menu.optionMenu("console.option.Show_Command_Editor", "commandEditor",
                "console.option.tip.Show_Command_Editor"),
            Menu.optionMenu("commandLineShowCompleterPopup", "commandLineShowCompleterPopup",
                "console.option.tip.Show_Completion_List_Popup")
        ];
    },

    getShowStackTraceMenuItem: function()
    {
        var label = Locale.$STR("ShowStackTrace");
        var tooltip = Locale.$STR("console.option.tip.Show_Stack_Trace");
        tooltip = Locale.$STRF("script.Script_panel_must_be_enabled", [tooltip]);

        var menuItem = Menu.optionMenu(label, "showStackTrace", tooltip);
        menuItem.nol10n = true;

        if (Firebug.currentContext && !Firebug.Debugger.isAlwaysEnabled())
            menuItem.disabled = true;

        return menuItem;
    },

    getStrictOptionMenuItem: function()
    {
        var strictDomain = "javascript.options";
        var strictName = "strict";
        var strictValue = Options.getPref(strictDomain, strictName);

        return {
            label: "JavascriptOptionsStrict",
            type: "checkbox",
            checked: strictValue,
            tooltiptext: "console.option.tip.Show_Strict_Warnings",
            command: function()
            {
                var checked = this.hasAttribute("checked");
                Options.setPref(strictDomain, strictName, checked);
            }
        };
    },

    getBreakOnMenuItems: function()
    {
       return [];
    },

    setFilter: function(filterTypes)
    {
        this.filterTypes = filterTypes;

        var panelNode = this.panelNode;
        Events.dispatch(this.fbListeners, "onFiltersSet", [logTypes]);

        // Make previously visible nodes invisible again
        if (this.filterMatchSet)
        {
            for (var i in this.filterMatchSet)
                Css.removeClass(this.filterMatchSet[i], "contentMatchesFilter");
        }

        this.filterMatchSet = [];

        for (var type in logTypes)
        {
            if (filterTypes.join(" ") != "all" && filterTypes.indexOf(type) == -1)
            {
                Css.setClass(panelNode, "hideType-" + type);
            }
            else
            {
                Css.removeClass(panelNode, "hideType-" + type);

                // xxxsz: There can be two kinds of error and warning messages,
                // which have one type. So map the type to the classes, which match it.
                // TODO: Merge different CSS class names for log message types

                var classNames = [type];
                if (type === "error")
                    classNames = ["error", "errorMessage"];
                else if (type === "warning")
                    classNames = ["warn", "warningMessage"];

                for (var i = 0, classNamesLen = classNames.length; i < classNamesLen; i++)
                {
                    var logRows = panelNode.getElementsByClassName("logRow-" + classNames[i]);
                    for (var j = 0, len = logRows.length; j < len; j++)
                    {
                        // Mark the groups, in which the log row is located, also as matched
                        for (var group = Dom.getAncestorByClass(logRows[j], "logRow-group"); group;
                            group = Dom.getAncestorByClass(group.parentNode, "logRow-group"))
                        {
                            Css.setClass(group, "contentMatchesFilter");
                            this.filterMatchSet.push(group);
                        }
                    }
                }
            }
        }
    },

    matchesFilter: function(logRow)
    {
        if (!this.filterTypes || this.filterTypes.join(" ") == "all")
            return true;

        var type = this.getLogRowType(logRow);
        return this.filterTypes.indexOf(type) != -1;
    },

    search: function(text)
    {
        // Make previously visible nodes invisible again
        if (this.matchSet)
        {
            for (var i in this.matchSet)
                Css.removeClass(this.matchSet[i], "matched");
        }

        if (!text)
            return;

        this.matchSet = [];

        function findRow(node)
        {
            return Dom.getAncestorByClass(node, "logRow");
        }

        var search = new Search.TextSearch(this.panelNode, findRow);

        var logRow = search.find(text, false, SearchBox.isCaseSensitive(text));
        if (!logRow)
        {
            Events.dispatch(this.fbListeners, "onConsoleSearchMatchFound", [this, text, []]);
            return false;
        }

        for (; logRow; logRow = search.findNext(undefined, undefined, undefined,
            SearchBox.isCaseSensitive(text)))
        {
            if (this.matchesFilter(logRow))
            {
                Css.setClass(logRow, "matched");

                // Mark the groups, in which the log row is located, also as matched
                for (var group = Dom.getAncestorByClass(logRow, "logRow-group"); group;
                    group = Dom.getAncestorByClass(group.parentNode, "logRow-group"))
                {
                    Css.setClass(group, "matched");
                    this.matchSet.push(group);
                }
                this.matchSet.push(logRow);
            }
        }

        Events.dispatch(this.fbListeners, "onConsoleSearchMatchFound",
            [this, text, this.matchSet]);

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Console Listeners

    onFiltersSet: function(filterTypes)
    {
        this.setFilter(filterTypes);
        SearchBox.update(this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getMessageMatcher: function(object, appender, className, rep, sourceLink, level)
    {
        function matchesMetaData(otherAppender, otherClassName, otherRep, otherLink, otherLevel)
        {
            if (otherAppender !== appender)
                return false;

            if (otherClassName !== className)
                return false;

            if (otherRep !== rep || (rep && rep.groupable === false))
                return false;

            if (otherLevel !== level)
                return false;

            var currentSourceInfo = (sourceLink ? sourceLink.href + ":" + sourceLink.line +
                (sourceLink.col ? ":" + sourceLink.col : "") : "");
            var otherSourceInfo = (otherLink ? otherLink.href + ":" + otherLink.line +
                (otherLink.col ? ":" + otherLink.col : "") : "");
            return currentSourceInfo === otherSourceInfo;
        }

        /**
         * Checks whether two variables are equal.
         *
         * @param {*} a First variable to be compared
         * @param {*} b Second variable to be compared
         * @returns {Boolean|undefined} True if values are equal, false if not,
         *     undefined if they are similar
         */
        function areEqual(a, b)
        {
            if (typeof a === "object" && a !== null)
                return false;

            if (a === b)
                return true;

            if (typeof a === "number" && typeof b === "number")
                return isNaN(a) && isNaN(b);

            return false;
        }

        return function matchMessage(otherObject, otherAppender, otherClassName, otherRep,
            otherSourceLink, otherLevel)
        {
            try
            {
                if (!matchesMetaData(otherAppender, otherClassName, otherRep, otherSourceLink,
                    otherLevel))
                {
                    return false;
                }

                var str = Object.prototype.toString.call(object);
                var isArray = (str === "[object Arguments]" || str === "[object Array]");
                if (isArray && rep !== FirebugReps.Arr)
                {
                    // console.log et al.
                    if (object.length !== otherObject.length)
                        return false;

                    for (var i=0, len=object.length; i<len; ++i)
                    {
                        if (!areEqual(object[i], otherObject[i]))
                            return false;
                    }

                    return true;
                }

                // Internal chrome objects are allowed to implement a custom "getId" function.
                if (object instanceof Object && "getId" in object)
                    return ("getId" in otherObject && object.getId() === otherObject.getId());

                return areEqual(object, otherObject);
            }
            catch (exc)
            {
                if (FBTrace.DBG_CONSOLE)
                    FBTrace.sysout("consolePanel.getMessageMatcher; failed to check equality", exc);

                return false;
            }
        };
    },

    increaseRowCount: function(row)
    {
        var counter = row.getElementsByClassName("logCounter").item(0);
        if (!counter)
            return;
        var value = counter.getElementsByClassName("logCounterValue").item(0);
        if (!value)
            return;

        var count = parseInt(value.textContent);
        if (isNaN(count))
            count = 1;

        count++;
        counter.setAttribute("count", count);
        value.textContent = count;
    },

    append: function(appender, objects, className, rep, sourceLink, noRow)
    {
        var row;
        var container = this.getTopContainer();
        if (noRow)
        {
            appender.apply(this, [objects]);
        }
        else
        {
            row = this.createRow("logRow", className);
            var logContent = row.getElementsByClassName("logContent").item(0);
            appender.apply(this, [objects, logContent, rep]);

            // If sourceLink is not provided and the object is an instance of Error
            // convert it into ErrorMessageObj instance, which implements getSourceLink
            // method.
            // xxxHonza: is there a better place where to make this kind of conversion?
            if (!sourceLink && (objects instanceof Error))
                objects = FirebugReps.Except.getErrorMessage(objects);

            if (!sourceLink && objects && objects.getSourceLink)
                sourceLink = objects.getSourceLink();

            if (Options.get("console.groupLogMessages") && this.matchesLastMessage &&
                this.matchesLastMessage(objects, appender, className, rep, sourceLink,
                    this.groups ? this.groups.length : 0))
            {
                this.increaseRowCount(container.lastChild);
                row = container.lastChild;
            }
            else
            {
                if (sourceLink)
                    FirebugReps.SourceLink.tag.append({object: sourceLink}, row.firstChild);

                container.appendChild(row);
            }

            this.matchesLastMessage = this.getMessageMatcher(objects, appender, className, rep,
                sourceLink, this.groups ? this.groups.length : 0);

            this.filterLogRow(row, this.wasScrolledToBottom);

            if (FBTrace.DBG_CONSOLE)
            {
                FBTrace.sysout("console.append; wasScrolledToBottom " + this.wasScrolledToBottom +
                    " " + row.textContent);
            }

            if (this.wasScrolledToBottom)
                Dom.scrollToBottom(this.panelNode);

            return row;
        }
    },

    clear: function()
    {
        if (this.panelNode)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("ConsolePanel.clear");

            Dom.clearNode(this.panelNode);
            this.insertLogLimit(this.context);

            Dom.scrollToBottom(this.panelNode);
            this.wasScrolledToBottom = true;

            // Don't forget to clear opened groups, if any.
            this.groups = null;

            this.matchesLastMessage = null;
        }
    },

    insertLogLimit: function()
    {
        // Create limit row. This row is the first in the list of entries
        // and initially hidden. It's displayed as soon as the number of
        // entries reaches the limit.
        var row = this.createRow("limitRow");

        // Configure the panel notification box.
        var prefName = Options.prefDomain + ".console.logLimit";
        var config = {
            totalCount: 0,
            prefName: prefName,
            buttonTooltip: Locale.$STRF("LimitPrefsTitle", [prefName])
        };

        var container = this.template.limitTag.replace({}, row);
        container = container.querySelector(".consolePanelNotification");

        this.limit = PanelNotification.render(container, config);

        this.panelNode.insertBefore(row, this.panelNode.firstChild);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    appendObject: function(object, row, rep)
    {
        if (!rep)
            rep = Firebug.getRep(object, this.context);

        // Don't forget to pass the template itself as the 'self' parameter so that it's used
        // by domplate as the 'subject' for the generation. Note that the primary purpose
        // of the subject is to provide a context object ('with (subject) {...}') for data that
        // are dynamically consumed during the rendering process.
        // This allows to derive new templates from an existing ones, without breaking
        // the default subject set within domplate() function.
        try
        {
            // XXX Hack until we get IF support in domplate (or bug 116083 gets fixed).
            var tag = rep.tag;
            if (rep === FirebugReps.Text)
                tag = rep.getWhitespaceCorrectedTag(object);
            return tag.append({object: object}, row, rep);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("consolePanel.appendObject; EXCEPTION " + e, e);
                FBTrace.sysout("consolePanel.appendObject; rep " + rep.className, rep);
            }
        }
    },

    appendFormatted: function(objects, row, rep)
    {
        function addHintText(text, row)
        {
            var nodeSpan = row.ownerDocument.createElement("span");
            nodeSpan.classList.add("logRowHint");
            nodeSpan.textContent = text;
            row.appendChild(nodeSpan);
        }

        function addText(text, row)
        {
            var tag = FirebugReps.Text.getWhitespaceCorrectedTag(text);
            return tag.append({object: text}, row);
        }

        function addStyle(node, css)
        {
            var dummyEl = node.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "div");
            dummyEl.setAttribute("style", css);
            node.setAttribute("style", "");
            for (var i = 0; i < dummyEl.style.length; i++)
            {
                var prop = dummyEl.style[i];
                if (reAllowedCss.test(prop))
                    node.style.setProperty(prop, dummyEl.style.getPropertyValue(prop));
            }
        }

        if (!objects || !objects.length)
        {
            // Make sure the log-row has proper height (even if empty).
            addHintText(Locale.$STR("console.msg.nothing_to_output"), row);
            return;
        }

        var format = objects[0];
        var objIndex = 1;

        if (typeof format != "string")
        {
            format = "";
            objIndex = 0;
        }
        else
        {
            // If we have a single, empty string, log an informative note about that.
            if (objects.length === 1 && !format)
            {
                addHintText(Locale.$STR("console.msg.an_empty_string"), row);
                return;
            }
        }

        var parts = parseFormat(format);
        var trialIndex = objIndex;
        for (var i = 0; i < parts.length; i++)
        {
            var part = parts[i];
            if (part && typeof(part) == "object")
            {
                if (trialIndex++ >= objects.length)
                {
                    // Too few parameters for format, assume unformatted.
                    format = "";
                    objIndex = 0;
                    parts.length = 0;
                    break;
                }
            }
        }

        // Last CSS style defined using "%c" that should be applied on
        // created log-row parts (elements). See issue 6064.
        // Example: console.log('%cred-text %cgreen-text', 'color:red', 'color:green');
        var lastStyle;

        for (var i = 0; i < parts.length; ++i)
        {
            var node;
            var part = parts[i];
            if (part && typeof part == "object")
            {
                var object = objects[objIndex];
                if (part.type == "%c")
                {
                    lastStyle = object.toString();
                }
                else if (objIndex < objects.length)
                {
                    if (part.type == "%f" && part.precision != -1)
                        object = parseFloat(object).toFixed(part.precision);
                    node = this.appendObject(object, row, part.rep);
                }
                else
                {
                    node = this.appendObject(part.type, row, FirebugReps.Text);
                }
                objIndex++;
            }
            else
            {
                node = addText(part, row);
            }

            // Apply custom style if available.
            if (lastStyle && node)
                addStyle(node, lastStyle);

            node = null;
        }

        for (var i = objIndex; i < objects.length; ++i)
        {
            row.appendChild(row.ownerDocument.createTextNode(" "));

            var object = objects[i];
            if (object === "")
                addHintText(Locale.$STR("console.msg.an_empty_string"), row);
            else if (typeof object == "string")
                addText(object, row);
            else
                this.appendObject(object, row);
        }
    },

    appendCollapsedGroup: function(objects, row, rep)
    {
        this.appendOpenGroup(objects, row, rep);
        Css.removeClass(row, "opened");
    },

    appendOpenGroup: function(objects, row, rep)
    {
        if (!this.groups)
            this.groups = [];

        Css.setClass(row, "logGroup");
        Css.setClass(row, "opened");

        var innerRow = this.createRow("logRow");
        Css.setClass(innerRow, "logGroupLabel");

        // Custom rep is used in place of group label.
        if (rep)
            rep.tag.replace({"object": objects}, innerRow);
        else
            this.appendFormatted(objects, innerRow, rep);

        row.appendChild(innerRow);
        Events.dispatch(this.fbListeners, "onLogRowCreated", [this, innerRow]);

        // Create group body, which is displayed when the group is expanded.
        var groupBody = this.createRow("logGroupBody");
        row.appendChild(groupBody);
        groupBody.setAttribute("role", "group");
        this.groups.push(groupBody);

        // Expand/collapse logic.
        Events.addEventListener(innerRow, "mousedown", function(event)
        {
            if (Events.isLeftClick(event))
            {
                var groupRow = event.currentTarget.parentNode;
                if (Css.hasClass(groupRow, "opened"))
                {
                    Css.removeClass(groupRow, "opened");
                    event.target.setAttribute("aria-expanded", "false");
                }
                else
                {
                    Css.setClass(groupRow, "opened");
                    event.target.setAttribute("aria-expanded", "true");
                }
            }
        }, false);
    },

    appendCloseGroup: function(object, row, rep)
    {
        if (this.groups)
            this.groups.pop();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // private

    createRow: function(rowName, className)
    {
        var elt = this.document.createElement("div");
        var row = this.template.logRowTag.append({className: rowName +
            (className ? " " + rowName + "-" + className : "")}, elt);
        return row;
    },

    getTopContainer: function()
    {
        if (this.groups && this.groups.length)
            return this.groups[this.groups.length-1];
        else
            return this.panelNode;
    },

    getLogRowType: function(logRow)
    {
        var typeMatch = /logRow-(\S*)/.exec(logRow.classList);
        var type = typeMatch ? typeMatch[1] : "";

        // xxxsz: There can be two kinds of error and warning messages,
        // which have one type. So map the different classes to the type
        // they represent.
        // TODO: Merge different CSS class names for log message types
        if (type == "errorMessage")
            type = "error";
        else if (type == "warn" || type == "warningMessage")
            type = "warning";

        return type;
    },

    filterLogRow: function(logRow, scrolledToBottom)
    {
        if (this.matchesFilter(logRow))
        {
            // Mark the groups, in which the log row is located, also as matched
            for (var group = Dom.getAncestorByClass(logRow, "logRow-group"); group;
                group = Dom.getAncestorByClass(group.parentNode, "logRow-group"))
            {
                Css.setClass(group, "contentMatchesFilter");
                this.filterMatchSet.push(group);
            }
        }

        if (this.searchText)
        {
            Css.setClass(logRow, "matching");
            Css.setClass(logRow, "matched");

            // Search after a delay because we must wait for a frame to be created for
            // the new logRow so that the finder will be able to locate it
            setTimeout(Obj.bindFixed(function()
            {
                if (this.searchFilter(this.searchText, logRow))
                    this.matchSet.push(logRow);
                else
                    Css.removeClass(logRow, "matched");

                Css.removeClass(logRow, "matching");

                if (scrolledToBottom)
                    Dom.scrollToBottom(this.panelNode);
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

        return Search.finder.Find(text, searchRange, startPt, endPt) != null;
    },

    showCommandLine: function(shouldShow)
    {
        var commandEditor = Options.get("commandEditor");
        if (shouldShow)
        {
            Dom.collapse(Firebug.chrome.$("fbCommandBox"), false);
            CommandLine.setMultiLine(commandEditor, Firebug.chrome);
        }
        else
        {
            // Make sure that entire content of the Console panel is hidden when
            // the panel is disabled.
            CommandLine.setMultiLine(false, Firebug.chrome, commandEditor);
            CommandLine.blur(this.context);
            Dom.collapse(Firebug.chrome.$("fbCommandBox"), true);
        }
    },

    onScroll: function(event)
    {
        // Update the scroll position flag if the position changes.
        this.wasScrolledToBottom = Dom.isScrolledToBottom(this.panelNode);

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
            Dom.scrollToBottom(this.panelNode);
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        var object = Firebug.getRepObject(target);
        var rep = Firebug.getRep(object, this.context);
        if (!rep)
            return false;

        return rep.showInfoTip(infoTip, target, x, y);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Break On Error

    shouldBreakOnNext: function()
    {
        return BreakOnError.shouldBreakOnNext(this.context);
    },

    breakOnNext: function(breaking, callback)
    {
        BreakOnError.breakOnNext(this.context, breaking, callback);
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("console.Disable Break On All Errors") :
            Locale.$STR("console.Break On All Errors"));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    updateSidePanels: function(panel)
    {
        if (!panel || panel.name != "console")
            return;

        // Custom update of the side panel box visibility.
        // The logic in {@FirebugChrome.syncSidePanels} hides the side box (fbPanelBar2)
        // if there is no selected panel. But in case of the Console (main) panel the
        // fbPanelBar2.selectedSide panel is null even if the {@CommandEditor} is active.
        // This is because {@CommandEditor} is not implemented as an instance of {@Firebug.Panel}
        // So, make sure to display it now.
        this.showCommandLine(true);
    },
});

// ********************************************************************************************* //

function parseFormat(format)
{
    var parts = [];
    if (format.length <= 0)
        return parts;

    var reg = /(%{1,2})(\.\d+)?([a-zA-Z])/;
    for (var m = reg.exec(format); m; m = reg.exec(format))
    {
        // If the percentage sign is escaped, then just output it
        if (m[1] == "%%")
        {
            parts.push(format.substr(0, m.index) + m[0].substr(1));
        }
        // A pattern was found, so it needs to be interpreted
        else
        {
            var type = m[3];
            var precision = m[2] ? parseInt(m[2].substr(1)) : -1;

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

            parts.push(format.substr(0, m.index));
            parts.push({rep: rep, precision: precision, type: "%" + type});
        }

        format = format.substr(m.index + m[0].length);
    }

    parts.push(format);
    return parts;
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(ConsolePanel);

// xxxHonza: backward compatibility
Firebug.ConsolePanel = ConsolePanel;

return ConsolePanel;

// ********************************************************************************************* //
});
