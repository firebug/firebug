/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

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
                    container.removeChild(container.firstChild.nextSibling);
                    panel.limit.limitInfo.totalCount++;
                    template.updateCounter(panel.limit);
                }

                return row;
            }
        }
        else
        {
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
        return context.getPanel("console", noCreate);
    },

};

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
        var element = win.document.getElementById("_firebugConsole");
        if (!element)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("getFirebugConsoleElement forcing element");
            var elementForcer = "var r=null; try { r = window._getFirebugConsoleElement();}catch(exc){r=exc;} r;";  // we could just add the elements here

            if (context.stopped)
                Firebug.Console.injector.evaluateConsoleScript(context);  // todo evaluate consoleForcer on stack
            else
                var r = Firebug.CommandLine.evaluateInWebPage(elementForcer, context, win);

            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("getFirebugConsoleElement forcing element result ", r);

            var element = win.document.getElementById("_firebugConsole");
            if (!element) // elementForce fails
            {
                if (FBTrace.DBG_ERRORS) FBTrace.sysout("console.getFirebugConsoleElement: no _firebugConsole in win:", win);
                Firebug.Console.logFormatted(["Firebug cannot find _firebugConsole element", r, win], context, "error", true);
            }
        }

        return element;
    },

    isReadyElsePreparing: function(context, win)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.isReadyElsePreparing, win is "+(win?"an argument: ":"null, context.window: ")+(win?win.location:context.window.location), (win?win:context.window));

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

    initContext: function(context, persistedState)
    {
        Firebug.ActivableModule.initContext.apply(this, arguments);

        // Create limit row. This row is the first in the list of entries
        // and initially hidden. It's displayed as soon as the number of
        // entries reache the limit.
        var panel = context.getPanel(this.panelName);
        var row = panel.createRow("limitRow");

        var limitInfo = {
            totalCount: 0,
            limitPrefsTitle: $STRF("LimitPrefsTitle", [Firebug.prefDomain+".console.logLimit"])
        };

        var netLimitRep = Firebug.NetMonitor.NetLimit;
        var nodes = netLimitRep.createTable(row, limitInfo);

        panel.limit = nodes[1];

        var container = panel.panelNode;
        container.insertBefore(nodes[0], container.firstChild);
    },

    showContext: function(browser, context)
    {
        if (browser)
            browser.chrome.setGlobalAttribute("cmd_clearConsole", "disabled", !context);

        Firebug.ActivableModule.showContext.apply(this, arguments);
    },

    // -----------------------------------------------------------------------------------------------------

    onPanelEnable: function(context, panelName)
    {
        if (panelName != this.panelName)  // we don't care about other panels
            return;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onPanelEnable**************");

        $('fbStatusIcon').setAttribute("console", "on");
        Firebug.Debugger.addDependentModule(this); // we inject the console during JS compiles so we need jsd
    },

    onPanelDisable: function(context, panelName)
    {
        if (panelName != this.panelName)  // we don't care about other panels
            return;

        Firebug.Debugger.removeDependentModule(this); // we inject the console during JS compiles so we need jsd
        $('fbStatusIcon').removeAttribute("console");
    },

    onSuspendFirebug: function(context)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onSuspendFirebug\n");
        Firebug.Errors.stopObserving();
        $('fbStatusIcon').removeAttribute("console");
    },

    onResumeFirebug: function(context)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.onResumeFirebug\n");
        if (Firebug.Console.isAlwaysEnabled())
        {
            Firebug.Errors.startObserving();
            $('fbStatusIcon').setAttribute("console", "on");
        }
    },

    // ----------------------------------------------------------------------------------------------------
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

    // ----------------------------------------------------------------------------------------------------
    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = FirebugContext;

        if (FBTrace.DBG_WINDOWS && !context) FBTrace.sysout("Console.logRow: no context \n");                          /*@explore*/

        // if (this.isEnabled(context)) XXXjjb I don't think we should test this every time
            return Firebug.ConsoleBase.logRow.apply(this, arguments);
    }
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
    wasScrolledToBottom: true,
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
            var scrolledToBottom = isScrolledToBottom(this.panelNode);

            var row = this.createRow("logRow", className);
            appender.apply(this, [objects, row, rep]);

            if (sourceLink)
                FirebugReps.SourceLink.tag.append({object: sourceLink}, row);

            container.appendChild(row);

            this.filterLogRow(row, scrolledToBottom);

            if (scrolledToBottom)
                scrollToBottom(this.panelNode);

            return row;
        }
    },

    clear: function()
    {
        if (this.panelNode)
            clearNode(this.panelNode);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    appendObject: function(object, row, rep)
    {
        if (!rep)
            rep = Firebug.getRep(object);
        return rep.tag.append({object: object}, row);
    },

    appendFormatted: function(objects, row, rep)
    {
        if (!objects || !objects.length)
            return;

        var format = objects[0];
        var objIndex = 0;

        if (typeof(format) != "string")
        {
            format = "";
            objIndex = -1;
        }

        function logText(text)
        {
            var node = row.ownerDocument.createTextNode(text);
            row.appendChild(node);
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
                this.appendObject(object, row, part.rep);
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
        if (rep)
            rep.tag.replace({"objects": objects}, innerRow);
        else
            this.appendFormatted(objects, innerRow, rep);
        row.appendChild(innerRow);

        var groupBody = this.createRow("logGroupBody");
        row.appendChild(groupBody);

        this.groups.push(groupBody);

        innerRow.addEventListener("mousedown", function(event)
        {
            if (isLeftClick(event))
            {
                var groupRow = event.currentTarget.parentNode;
                if (hasClass(groupRow, "opened"))
                    removeClass(groupRow, "opened");
                else
                    setClass(groupRow, "opened");
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
    editable: false,

    initialize: function()
    {
        Firebug.ActivablePanel.initialize.apply(this, arguments);

        // Initialize log limit and listen for changes.
        this.updateMaxLimit();
        prefs.addObserver(Firebug.prefDomain, this, false);
    },

    shutdown: function()
    {
        prefs.removeObserver(Firebug.prefDomain, this, false);
    },

    show: function(state)
    {
        var enabled = Firebug.Console.isAlwaysEnabled();
        if (enabled)
        {
             Firebug.Console.disabledPanelPage.hide(this);
             this.showCommandLine(true);
             this.showToolbarButtons("fbConsoleButtons", true);
        }
        else
        {
            this.hide();
            Firebug.Console.disabledPanelPage.show(this);
        }
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

    hide: function()
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("Console.panel hide\n");

        this.showToolbarButtons("fbConsoleButtons", false);
        this.showCommandLine(false);
        this.wasScrolledToBottom = isScrolledToBottom(this.panelNode);
    },

    getOptionsMenuItems: function()
    {
        return [
            optionMenu("ShowJavaScriptErrors", "showJSErrors"),
            optionMenu("ShowJavaScriptWarnings", "showJSWarnings"),
            optionMenu("ShowCSSErrors", "showCSSErrors"),
            optionMenu("ShowXMLErrors", "showXMLErrors"),
            this.xhrSpyOptionMenu(),
            optionMenu("ShowChromeErrors", "showChromeErrors"),
            optionMenu("ShowChromeMessages", "showChromeMessages"),
            optionMenu("ShowExternalErrors", "showExternalErrors"),
            this.getShowStackTraceMenuItem(),
            this.getStrictOptionMenuItem(),
            "-",
            optionMenu("LargeCommandLine", "largeCommandLine")
        ];
    },

    xhrSpyOptionMenu: function()
    {
        var option = optionMenu("ShowXMLHttpRequests", "showXMLHttpRequests");

        // XHR Spy is disabled in in Firefox > 3.1 till #483672 is fixed.
        if (versionChecker.compare(appInfo.version, "3.1") >= 0)
        {
            option.disabled = true;
            option.checked = false;
            option.tooltiptext = "This option is disabled in Firefox 3.1 and higher till " + 
                "bug #483672 is fixed.";
        }

        return option;
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
            return false;

        for (; logRow; logRow = search.findNext())
        {
            setClass(logRow, "matched");
            this.matchSet.push(logRow);
        }

        return true;
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
            this.context.chrome.$("fbCommandBox").collapsed = false;
            Firebug.CommandLine.setMultiLine(Firebug.largeCommandLine, this.context.chrome);
        }
        else
        {
            if (this.context.chrome)
            {
                // Make sure that entire content of the Console panel is hidden when
                // the panel is disabled.
                Firebug.CommandLine.setMultiLine(false, this.context.chrome);
                this.context.chrome.$("fbCommandBox").collapsed = true;
            }
            // else the context is not setup, ok we aren't showing it.
        }
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
                    rep = null;
                    break;
            }

            parts.push(format.substr(0, m[0][0] == "%" ? m.index : m.index+1));
            parts.push({rep: rep, precision: precision});
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
