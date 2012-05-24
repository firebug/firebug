/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/domplate",
    "firebug/lib/xpcom",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/lib/http",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/search",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "httpmonitor/net/netUtils",

    "httpmonitor/net/netPanel",
    "httpmonitor/net/netFile",

    "firebug/js/breakpoint",
    "firebug/net/xmlViewer",
    "firebug/net/svgViewer",
    "firebug/net/jsonViewer",
    "firebug/net/fontViewer",
    "firebug/chrome/infotip",
    "firebug/css/cssPanel",
    "firebug/chrome/searchBox",
    "firebug/console/errors",
    "firebug/net/netMonitor",
],
function(Obj, Firebug, Firefox, Domplate, Xpcom, Locale,
    Events, Options, Url, SourceLink, Http, Css, Dom, Win, Search, Str,
    Arr, System, Menu, NetUtils, HttpMonitorPanel, NetFile) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var layoutInterval = 300;
var panelName = "net";
var NetRequestEntry = Firebug.NetMonitor.NetRequestEntry;

// ********************************************************************************************* //

/**
 * @panel Represents a Firebug panel that displayes info about HTTP activity associated with
 * the current page. This class is derived from <code>Firebug.ActivablePanel</code> in order
 * to support activation (enable/disable). This allows to avoid (performance) expensive
 * features if the functionality is not necessary for the user.
 */
function NetPanel() {}
NetPanel.prototype = Obj.extend(Firebug.ActivablePanel, HttpMonitorPanel.prototype,
/** lends NetPanel */
{
    show: function(state)
    {
        HttpMonitorPanel.prototype.show.apply(this, arguments);

        // xxxHonza: activation
    },

    showToolbarButtons: function(buttonsId, show)
    {
        try
        {
            var buttons = Firebug.chrome.$(buttonsId);
            Dom.collapse(buttons, !show);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.Panel showToolbarButtons FAILS "+exc, exc);
        }
    },

    updateOption: function(name, value)
    {
        if (name == "netFilterCategory")
        {
            Firebug.NetMonitor.syncFilterButtons(Firebug.chrome);
            Firebug.connection.eachContext(function syncFilters(context)
            {
                Firebug.NetMonitor.onToggleFilter(context, value);
            });
        }
        else if (name == "netShowBFCacheResponses")
        {
            this.updateBFCacheResponses();
        }
    },

    supportsObject: function(object, type)
    {
        return ((object instanceof SourceLink.SourceLink && object.type == "net") ? 2 : 0);
    },

    getContextMenuItems: function(nada, target)
    {
        var items = HttpMonitorPanel.prototype.getContextMenuItems.apply(this, arguments);

        var file = Firebug.getRepObject(target);
        if (!file || !(file instanceof NetFile))
            return items;

        if (file.isXHR)
        {
            var bp = this.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());

            items.push(
                "-",
                {
                    label: "net.label.Break_On_XHR",
                    tooltiptext: "net.tip.Break_On_XHR",
                    type: "checkbox",
                    checked: !!bp,
                    command: Obj.bindFixed(this.breakOnRequest, this, file)
                }
            );

            if (bp)
            {
                items.push(
                    {
                        label: "EditBreakpointCondition",
                        tooltiptext: "breakpoints.tip.Edit_Breakpoint_Condition",
                        command: Obj.bindFixed(this.editBreakpointCondition, this, file)
                    }
                );
            }
        }

        return items;
    },

    breakOnRequest: function(file)
    {
        if (!file.isXHR)
            return;

        // Create new or remove an existing breakpoint.
        var breakpoints = this.context.netProgress.breakpoints;
        var url = file.getFileURL();
        var bp = breakpoints.findBreakpoint(url);
        if (bp)
            breakpoints.removeBreakpoint(url);
        else
            breakpoints.addBreakpoint(url);

        this.enumerateRequests(function(currFile)
        {
            if (url != currFile.getFileURL())
                return;

            if (bp)
                currFile.row.removeAttribute("breakpoint");
            else
                currFile.row.setAttribute("breakpoint", "true");
        })
    },

    // Support for xhr breakpoint conditions.
    onContextMenu: function(event)
    {
        if (!Css.hasClass(event.target, "sourceLine"))
            return;

        var row = Dom.getAncestorByClass(event.target, "netRow");
        if (!row)
            return;

        var file = row.repObject;
        var bp = this.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());
        if (!bp)
            return;

        this.editBreakpointCondition(file);
        Events.cancelEvent(event);
    },

    editBreakpointCondition: function(file)
    {
        var bp = this.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());
        if (!bp)
            return;

        var condition = bp ? bp.condition : "";

        this.selectedSourceBox = this.panelNode;
        Firebug.Editor.startEditing(file.row, condition);
    },

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new Firebug.NetMonitor.ConditionEditor(this.document);

        return this.conditionEditor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Activable Panel

    /**
     * Support for panel activation.
     */
    onActivationChanged: function(enable)
    {
        if (FBTrace.DBG_NET || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("net.NetPanel.onActivationChanged; enable: " + enable);

        if (enable)
        {
            Firebug.NetMonitor.addObserver(this);
            Firebug.TabCacheModel.addObserver(this);
        }
        else
        {
            Firebug.NetMonitor.removeObserver(this);
            Firebug.TabCacheModel.removeObserver(this);
        }
    },

    breakOnNext: function(breaking)
    {
        this.context.breakOnXHR = breaking;
    },

    shouldBreakOnNext: function()
    {
        return this.context.breakOnXHR;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("net.Disable Break On XHR") : Locale.$STR("net.Break On XHR"));
    },
});

// ********************************************************************************************* //
// Net Panel Link

/**
 * Use this object to automatically select Net panel and inspect a network request.
 * Firebug.chrome.select(new Firebug.NetMonitor.NetFileLink(url [, request]));
 */
Firebug.NetMonitor.NetFileLink = function(href, request)
{
    this.href = href;
    this.request = request;
}

Firebug.NetMonitor.NetFileLink.prototype =
{
    toString: function()
    {
        return this.message + this.href;
    }
};

// ********************************************************************************************* //
// Breakpoint condition

Firebug.NetMonitor.ConditionEditor = function(doc)
{
    Firebug.Breakpoint.ConditionEditor.apply(this, arguments);
}

Firebug.NetMonitor.ConditionEditor.prototype = domplate(Firebug.Breakpoint.ConditionEditor.prototype,
{
    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;

        var file = target.repObject;
        var panel = Firebug.getElementPanel(target);
        var bp = panel.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());
        if (bp)
            bp.condition = value;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(NetPanel);

return Firebug.NetMonitor;

// ********************************************************************************************* //
}});
