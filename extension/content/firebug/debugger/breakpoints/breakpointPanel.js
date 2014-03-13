/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/panel",
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/persist",
    "firebug/debugger/breakpoints/breakpoint",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/lib/url",
],
function(Firebug, Panel, Obj, FBTrace, FirebugReps, Locale, Events, StackFrame, Persist,
    Breakpoint, BreakpointStore, Url) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_BREAKPOINTPANEL");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Breakpoint Panel

function BreakpointPanel()
{
}

/**
 * @panel Represents the Breakpoints side panel available within the Script panel.
 */
BreakpointPanel.prototype = Obj.extend(Panel,
/** @lends BreakpointPanel */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "breakpoints",
    parentPanel: "script",
    order: 2,
    enableA11y: true,
    deriveA11yFrom: "console",
    remotable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        this.groupOpened = [];

        Panel.initialize.apply(this, arguments);

        // Listen to breakpoint changes (add/remove/enable/disable).
        // These events are used to refresh the panel content.
        this.context.getTool("breakpoint").addListener(this);
    },

    destroy: function(state)
    {
        state.groupOpened = this.groupOpened;

        Panel.destroy.apply(this, arguments);

        this.context.getTool("breakpoint").removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    show: function(state)
    {
        if (this.context.loaded)
        {
            var state;
            Persist.restoreObjects(this, state);

            if (state)
            {
                if (state.groupOpened)
                    this.groupOpened = state.groupOpened;
            }
        }

        this.refresh();
    },

    refresh: function()
    {
        if (this.noRefresh)
            return;

        var extracted = this.extractBreakpoints(this.context);
        if (!extracted)
            return;

        var breakpoints = extracted.breakpoints;
        var errorBreakpoints = extracted.errorBreakpoints;
        var monitors = extracted.monitors;

        function sortBreakpoints(a, b)
        {
            if (a.href == b.href)
                return a.lineNo < b.lineNo ? -1 : 1;
            else
                return a.href < b.href ? -1 : 1;
        }

        breakpoints.sort(sortBreakpoints);
        errorBreakpoints.sort(sortBreakpoints);
        monitors.sort(sortBreakpoints);

        var groups = [];

        if (breakpoints.length)
        {
            groups.push({name: "breakpoints", title: Locale.$STR("Breakpoints"),
                breakpoints: breakpoints});
        }

        if (errorBreakpoints.length)
        {
            groups.push({name: "errorBreakpoints", title: Locale.$STR("ErrorBreakpoints"),
                breakpoints: errorBreakpoints});
        }

        if (monitors.length)
        {
            groups.push({name: "monitors", title: Locale.$STR("LoggedFunctions"),
                breakpoints: monitors});
        }

        Firebug.connection.dispatch("getBreakpoints", [this.context, groups]);

        if (groups.length != 0)
        {
            for (var i = 0; i < groups.length; ++i)
            {
                groups[i].opened = typeof this.groupOpened[groups[i].name] != "undefined" ?
                    this.groupOpened[groups[i].name] : true;
            }

            Firebug.Breakpoint.BreakpointListRep.tag.replace(
                {groups: groups}, this.panelNode);
        }
        else
        {
            FirebugReps.Warning.tag.replace({object: "NoBreakpointsWarning"}, this.panelNode);
        }

        Trace.sysout("breakpointPanel.refresh; " + breakpoints.length + ", " + 
            errorBreakpoints.length + ", " + monitors.length,
            [breakpoints, errorBreakpoints, monitors]);

        Events.dispatch(this.fbListeners, "onBreakRowsRefreshed", [this, this.panelNode]);
    },

    // xxxHonza: This function is also responsible for setting the breakpoint name.
    // It should be done just once and probably somewhere else.
    // Note that the breakpoint name can be generated from the source and the source
    // (especially in case of dynamically created scripts) doesn't have to be immediately
    // available. Since the methods always set the name, it's auto-updated in the panel.
    extractBreakpoints: function(context)
    {
        var breakpoints = [];
        var errorBreakpoints = [];
        var monitors = [];

        var self = this;

        context.enumerateSourceFiles(function(sourceFile)
        {
            var url = sourceFile.getURL();

            // When extracting breakpoints for the current page make sure to remove the
            // URL fragment. Also pass 'true' for the 'dynamic' argument into enumeration methods,
            // so all breakpoints for this page are displayed in the Breakpoints panel.
            // 1) There can be dynamic breakpoints for dynamic scripts with special URL suffix.
            // 2) There can be breakpoints using a URL fragment (see issue 7251).
            url = Url.normalizeURL(url);

            // xxxHonza: We might want to introduce an 'options' argument
            // for all the enumeration methods.
            BreakpointStore.enumerateBreakpoints(url, true, function(bp)
            {
                self.getSourceLine(bp, sourceFile);

                // xxxHonza: optimize me
                // There can be duplicates since dynamic breakpoints are returned for
                // the parent script URL as well as for the (dynamic) URL they really belong to.
                if (breakpoints.indexOf(bp) == -1)
                    breakpoints.push(bp);
            });

            BreakpointStore.enumerateErrorBreakpoints(url, true, function(bp)
            {
                self.getSourceLine(bp, sourceFile);

                if (errorBreakpoints.indexOf(bp) == -1)
                    errorBreakpoints.push(bp);
            });

            BreakpointStore.enumerateMonitors(url, true, function(bp)
            {
                self.getSourceLine(bp, sourceFile);

                if (monitors.indexOf(bp) == -1)
                    monitors.push(bp);
            });
        });

        var result = {
            breakpoints: breakpoints,
            errorBreakpoints: errorBreakpoints,
            monitors: monitors
        };

        return result;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Source

    getSourceLine: function(bp, sourceFile)
    {
        var self = this;
        var line = bp.lineNo;

        if (bp.href != sourceFile.href)
        {
            var name = StackFrame.guessFunctionName(bp.href, line + 1);
            bp.setName(name);
            bp.setSourceLine("");
            return;
        }

        // Getting source might be asynchronous in case the source is not yet
        // fetched from the server side.
        sourceFile.getLine(line, function(sourceLine)
        {
            var name = StackFrame.guessFunctionName(bp.href, line + 1, sourceFile);

            bp.setName(name);
            bp.setSourceLine(sourceLine);

            // Update UI
            self.updateBreakpointRow(bp);
        });
    },

    updateBreakpointRow: function(bp)
    {
        var rows = this.panelNode.getElementsByClassName("breakpointRow");

        // Iterate over all displayed breakpoints (rows) and update the one
        // passed into this method.
        for (var i = 0; i < rows.length; i++)
        {
            var row = rows[i];
            var repObject = Firebug.getRepObject(row);
            if (repObject != bp)
                continue;

            // Re-render the breakpoint row. Not to forget that we need to dynamically
            // find the proper breakpoint template. Some breakpoint are using custom
            // templates for rendering in the list.
            var parentNode = row.parentNode;
            var rep = Firebug.getRep(bp, this.context);
            var newRow = rep.tag.append({bp: bp}, parentNode);
            parentNode.replaceChild(newRow, row);
            break;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    getOptionsMenuItems: function()
    {
        var items = [];

        var context = this.context;
        var bpCount = 0;
        var disabledCount = 0;
        var checkBoxes = this.panelNode.getElementsByClassName("breakpointCheckbox");

        for (var i = 0; i < checkBoxes.length; i++)
        {
            bpCount++;
            if (!checkBoxes[i].checked)
                disabledCount++;
        }

        if (disabledCount)
        {
            items.push({
                label: "EnableAllBreakpoints",
                command: Obj.bindFixed(this.enableAllBreakpoints, this, context, true),
                tooltiptext: "breakpoints.option.tip.Enable_All_Breakpoints"
            });
        }

        if (bpCount && disabledCount != bpCount)
        {
            items.push({
                label: "DisableAllBreakpoints",
                command: Obj.bindFixed(this.enableAllBreakpoints, this, context, false),
                tooltiptext: "breakpoints.option.tip.Disable_All_Breakpoints"
            });
        }

        items.push("-", {
            label: "ClearAllBreakpoints",
            disabled: !bpCount,
            command: Obj.bindFixed(this.clearAllBreakpoints, this, context),
            tooltiptext: "breakpoints.option.tip.Clear_All_Breakpoints"
        });

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    getContextMenuItems: function(object, target, context)
    {
        return this.getOptionsMenuItems();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    enableAllBreakpoints: function(context, status)
    {
        var checkBoxes = this.panelNode.getElementsByClassName("breakpointCheckbox");
        for (var i = 0; i < checkBoxes.length; i++)
        {
            var box = checkBoxes[i];
            if (box.checked != status)
                this.click(box);
        }
    },

    clearAllBreakpoints: function(context)
    {
        TraceError.sysout("breakpointPanel.clearAllBreakpoints;");

        // Remove all breakpoints. Note that some can come from various modules and
        // perhaps also various extensions, so use the appropriate remove buttons for now.
        // xxxHonza: we should dispatch a message that would be properly handled by
        // all modules that provided the breakpoints (see also "getBreakpoints" event).
        // See also issue 7227
        // xxxHonza: if the breakpoint removal fails from some reason (breakpoint doesn't
        // If the breakpoint removal fails from some reason (breakpoint doesn't
        // exist, etc.) the UI BP entry is not removed, and so the |buttons| array is never
        // empty. This causes infinite recursion.
        var buttons = this.panelNode.getElementsByClassName("closeButton");
        while (buttons.length)
            this.click(buttons[0]);

        // Breakpoint group titles must also go away.
        this.refresh();
    },

    click: function(node)
    {
        var doc = node.ownerDocument, event = doc.createEvent("MouseEvents");
        event.initMouseEvent("click", true, true, doc.defaultView, 0, 0, 0, 0, 0,
            false, false, false, false, 0, null);
        return node.dispatchEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    onBreakpointAdded: function(bp)
    {
        this.refresh();
    },

    onBreakpointRemoved: function(bp)
    {
        this.refresh();
    },

    onBreakpointEnabled: function(bp)
    {
        this.refresh();
    },

    onBreakpointDisabled: function(bp)
    {
        this.refresh();
    },

    onBreakpointModified: function(bp)
    {
        this.refresh();
    },

    onBreakpointLineChanged: function (bp, oldLineNo)
    {
        this.refresh();
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(BreakpointPanel);
Firebug.registerTracePrefix("breakpointPanel.", "DBG_BREAKPOINTPANEL", false);

return BreakpointPanel;

// ********************************************************************************************* //
});
