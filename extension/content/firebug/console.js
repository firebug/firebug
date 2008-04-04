/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(nsIPrefBranch2);

// ************************************************************************************************

var listeners = [];
var maxQueueRequests = 100;

// ************************************************************************************************

Firebug.Console = extend(Firebug.Module,
{
    log: function(object, context, className, rep, noThrottle, sourceLink)
    {
        dispatch(listeners,"log",[context, object, className, sourceLink]);
        return this.logRow(appendObject, object, context, className, rep, sourceLink, noThrottle);
    },

    logFormatted: function(objects, context, className, noThrottle, sourceLink)
    {
        dispatch(listeners,"logFormatted",[context, objects, className, sourceLink]);
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
        if (FBTrace.DBG_WINDOWS && !context) FBTrace.sysout("Console.logRow: no context \n");                          /*@explore*/

        if (noThrottle || !context)
        {
            var panel = this.getPanel(context);
            if (panel)
            {
                var row = panel.append(appender, objects, className, rep, sourceLink, noRow);

                var container = panel.getTopContainer();
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

    addListener: function(listener)
    {
        listeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(listeners, listener);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    showContext: function(browser, context)
    {
        browser.chrome.setGlobalAttribute("cmd_clearConsole", "disabled", !context);
    },

    watchWindow: function(context, win)
    {
        // This is early enough but we don't have a frame
        if (win.wrappedJSObject && !win.wrappedJSObject._firebug)
            this.attachConsoleInjector(context, win);

        if (FBTrace.DBG_WINDOWS)                                                                                       /*@explore*/
        {                                                                                                              /*@explore*/
            if (win.wrappedJSObject._firebug)                                                                                           /*@explore*/
                FBTrace.sysout("firebug.watchWindow created win._firebug for "+win.location+"\n");          /*@explore*/
            else                                                                                                       /*@explore*/
                FBTrace.sysout("firebug.watchWindow failed to create win._firebug for "+win.location+"\n"); /*@explore*/
        }                                                                                                              /*@explore*/
                                                                                                                       /*@explore*/
    },

    getConsoleInjectionScript: function() {
        if (!this.consoleInjectionScript)
        {
            var startLoader = "window.__defineGetter__('firebug', function() { \n";
            var checkLoad = " if (window._FirebugConsole) return this._firebug;\n";
            var eventCreation = " var event = document.createEvent('Events'); \n";
            var eventInit = " event.initEvent('loadFirebugConsole', true, false); \n"
            var eventDispatch = " window.dispatchEvent(event); \n";
            var endLoader = " return this._firebug;});\n";
            this.consoleInjectionScript = startLoader +  checkLoad + eventCreation + eventInit + eventDispatch + endLoader;
        }
        return this.consoleInjectionScript;
    },

    attachConsoleInjector: function(context, win)
    {
        if (!context.attachConsoleInjectorHandler)
            context.attachConsoleInjectorHandler = [];

        var handler = function(event)
        {
            var handler;
            for (var i=0; i< context.attachConsoleInjectorHandler.length; i++) {
                if (context.attachConsoleInjectorHandler[i].window == win) {
                    handler = context.attachConsoleInjectorHandler[i].handler;
                    break;
                }
            }
            Firebug.Console.injector.attachConsole(context, win);
            win.removeEventListener('loadFirebugConsole', handler, true);
            context.attachConsoleInjectorHandler.splice(i, 1);
        }
        win.addEventListener('loadFirebugConsole', handler, true);

        context.attachConsoleInjectorHandler.push({window: win, handler:handler});

        var consoleInjection = this.getConsoleInjectionScript();

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("attachConsoleInjector evaluating in "+win.location+":\n "+consoleInjection+"\n");

        Firebug.CommandLine.evaluateInSandbox(consoleInjection, context, null, win);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("attachConsoleInjector evaluation completed\n");
    },

    showPanel: function(browser, panel)
    {
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

Firebug.ConsolePanel.prototype = extend(Firebug.Panel,
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
        Firebug.Panel.initialize.apply(this, arguments);

        var row = this.createRow("limitRow");

        var template = Firebug.NetMonitor.NetLimit;
        var nodes = template.createTable(row);

        this.limit = nodes[1];

        var container = this.getTopContainer();
        container.appendChild(nodes[0]);

        // Initialize log limit and listen for changes.
        this.updateMaxLimit();
        prefs.addObserver(Firebug.prefDomain, this, false);
    },

    shutdown: function() {
        prefs.removeObserver(Firebug.prefDomain, this, false);
    },

    show: function(state)
    {
        if (FBTrace.DBG_PANELS) FBTrace.sysout("Console.panel show\n");                                               /*@explore*/

        this.showToolbarButtons("fbConsoleButtons", true);
        if (this.wasScrolledToBottom)
            scrollToBottom(this.panelNode);
    },

    hide: function()
    {
        if (FBTrace.DBG_PANELS) FBTrace.sysout("Console.panel hide\n");                                               /*@explore*/

        this.showToolbarButtons("fbConsoleButtons", false);
        this.wasScrolledToBottom = isScrolledToBottom(this.panelNode);
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
            serviceOptionMenu("ShowStackTrace", "showStackTrace"),
            "-",
            optionMenu("LargeCommandLine", "largeCommandLine")
        ];
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
        if (prefName == "maxQueueRequests")
            this.updateMaxLimit();
    },

    updateMaxLimit: function()
    {
        var value = Firebug.getPref(Firebug.prefDomain, "maxQueueRequests");
        maxQueueRequests =  value ? value : maxQueueRequests;
    }
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

Firebug.registerModule(Firebug.Console);
Firebug.registerPanel(Firebug.ConsolePanel);

// ************************************************************************************************

}});
