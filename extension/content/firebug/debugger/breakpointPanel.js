/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/js/stackFrame",
    "firebug/lib/persist",
    "firebug/debugger/sourceFileRenamer",
    "firebug/debugger/breakpoint",
    "firebug/debugger/breakpointStore",
],
function(Obj, Firebug, FirebugReps, Locale, Events, StackFrame, Persist, SourceFileRenamer,
    Breakpoint, BreakpointStore) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Breakpoint Panel

function BreakpointPanel()
{
}

BreakpointPanel.prototype = Obj.extend(Firebug.Panel,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "jsd2breakpoints",
    parentPanel: "jsd2script",
    order: 2,
    enableA11y: true,
    deriveA11yFrom: "console",
    remotable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        this.groupOpened = [];

        Firebug.Panel.initialize.apply(this, arguments);

        // Listen to breakpoint changes (add/remove).
        BreakpointStore.addListener(this);
    },

    destroy: function(state)
    {
        state.groupOpened = this.groupOpened;

        Firebug.Panel.destroy.apply(this, arguments);

        BreakpointStore.removeListener(this);
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

        if (FBTrace.DBG_BP)
        {
            FBTrace.sysout("breakpoints.refresh extracted " +
                breakpoints.length + errorBreakpoints.length + monitors.length,
                [breakpoints, errorBreakpoints, monitors]);
        }

        function sortBreakpoints(a, b)
        {
            if (a.href == b.href)
                return a.lineNumber < b.lineNumber ? -1 : 1;
            else
                return a.href < b.href ? -1 : 1;
        }

        breakpoints.sort(sortBreakpoints);
        errorBreakpoints.sort(sortBreakpoints);
        monitors.sort(sortBreakpoints);

        if (FBTrace.DBG_BP)
        {
            FBTrace.sysout("breakpoints.refresh sorted " + breakpoints.length +
                errorBreakpoints.length + monitors.length,
                [breakpoints, errorBreakpoints, monitors]);
        }

        var groups = [];

        if (breakpoints.length)
            groups.push({name: "breakpoints", title: Locale.$STR("Breakpoints"),
                breakpoints: breakpoints});

        if (errorBreakpoints.length)
            groups.push({name: "errorBreakpoints", title: Locale.$STR("ErrorBreakpoints"),
                breakpoints: errorBreakpoints});

        if (monitors.length)
            groups.push({name: "monitors", title: Locale.$STR("LoggedFunctions"),
                breakpoints: monitors});

        Firebug.connection.dispatch("getBreakpoints", [this.context, groups]);

        if (groups.length != 0)
        {
            for (var i = 0; i < groups.length; ++i)
            {
                groups[i].opened = typeof this.groupOpened[groups[i].name] != "undefined" ?
                    this.groupOpened[groups[i].name] : true;
            }

            Firebug.JSD2.Breakpoint.BreakpointListRep.tag.replace(
                {groups: groups}, this.panelNode);
        }
        else
        {
            FirebugReps.Warning.tag.replace({object: "NoBreakpointsWarning"}, this.panelNode);
        }

        if (FBTrace.DBG_BP)
        {
            FBTrace.sysout("breakpoints.refresh " + breakpoints.length +
                errorBreakpoints.length + monitors.length,
                [breakpoints, errorBreakpoints, monitors]);
        }

        Events.dispatch(this.fbListeners, "onBreakRowsRefreshed", [this, this.panelNode]);
    },

    extractBreakpoints: function(context)
    {
        var breakpoints = [];
        var errorBreakpoints = [];
        var monitors = [];

        var renamer = new SourceFileRenamer(context);
        var self = this;

        for (var url in context.compilationUnits)
        {
            BreakpointStore.enumerateBreakpoints(url, {call: function(url, line, props, scripts)
            {
                if (FBTrace.DBG_BP)
                {
                    FBTrace.sysout("breakpoints.extractBreakpoints type: " + props.type +
                        " in url " + url + "@" + line + " context " + context.getName(),
                        props);
                }

                // some url in this sourceFileMap has changed, we'll be back.
                if (renamer.checkForRename(url, line, props))
                    return;

                if (scripts)  // then this is a current (not future) breakpoint
                {
                    var script = scripts[0];
                    var analyzer = Firebug.SourceFile.getScriptAnalyzer(context, script);

                    if (FBTrace.DBG_BP)
                    {
                        FBTrace.sysout("breakpoints.refresh enumerateBreakpoints for script=" +
                            script.tag + (analyzer ? " has analyzer" : " no analyzer") +
                            " in context " + context.getName());
                    }

                    if (analyzer)
                        var name = analyzer.getFunctionDescription(script, context).name;
                    else
                        var name = StackFrame.guessFunctionName(url, 1, context);

                    var isFuture = false;
                }
                else
                {
                    if (FBTrace.DBG_BP)
                    {
                        FBTrace.sysout("breakpoints.refresh enumerateBreakpoints future " +
                            "for url@line=" + url + "@" + line);
                    }

                    var isFuture = true;
                }

                var source = context.sourceCache.getLine(url, line);
                breakpoints.push(new Breakpoint(name, url, line, !props.disabled,
                    source, isFuture));
            }});

            BreakpointStore.enumerateErrorBreakpoints(url, {call: function(url, line, props)
            {
                // some url in this sourceFileMap has changed, we'll be back.
                if (renamer.checkForRename(url, line, props))
                    return;

                var name = Firebug.SourceFile.guessEnclosingFunctionName(url, line, context);
                var source = context.sourceCache.getLine(url, line);
                errorBreakpoints.push(new Breakpoint(name, url, line, true, source));
            }});

            BreakpointStore.enumerateMonitors(url, {call: function(url, line, props)
            {
                // some url in this sourceFileMap has changed, we'll be back.
                if (renamer.checkForRename(url, line, props))
                    return;

                var name = Firebug.SourceFile.guessEnclosingFunctionName(url, line, context);
                monitors.push(new Breakpoint(name, url, line, true, ""));
            }});
        }

        var result = null;

        if (renamer.needToRename(context))
        {
            // since we renamed some sourceFiles we need to refresh the breakpoints again.
            result = this.extractBreakpoints(context);
        }
        else
        {
            result = {
                breakpoints: breakpoints,
                errorBreakpoints: errorBreakpoints,
                monitors: monitors
            };
        }

        // even if we did not rename, some bp may be dynamic
        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("breakpoints.extractBreakpoints context.dynamicURLhasBP: "+
                context.dynamicURLhasBP, result);
        }

        return result;
    },

    getOptionsMenuItems: function()
    {
        var items = [];

        var context = this.context;
        var bpCount = 0;
        var disabledCount = 0;
        var checkBoxes = this.panelNode.getElementsByClassName("breakpointCheckbox");

        for (var i=0; i<checkBoxes.length; i++)
        {
            ++bpCount;
            if (!checkBoxes[i].checked)
                ++disabledCount;
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

    getContextMenuItems: function(object, target, context)
    {
        return this.getOptionsMenuItems();
    },

    enableAllBreakpoints: function(context, status)
    {
        var checkBoxes = this.panelNode.getElementsByClassName("breakpointCheckbox");
        for (var i=0; i<checkBoxes.length; i++)
        {
            var box = checkBoxes[i];
            if (box.checked != status)
                this.click(box);
        }
    },

    clearAllBreakpoints: function(context)
    {
        this.noRefresh = true;

        try
        {
            // Remove regular JSD breakpoints
            Firebug.Debugger.clearAllBreakpoints(context);
        }
        catch(exc)
        {
            FBTrace.sysout("breakpoint.clearAllBreakpoints FAILS "+exc, exc);
        }

        this.noRefresh = false;
        this.refresh();

        // Remove the rest of all the other kinds of breakpoints (after refresh).
        // These can come from various modules and perhaps extensions, so use
        // the appropriate remove buttons.
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
    // BreakpointStore Listener

    onBreakpointAdded: function(bp)
    {
        this.refresh();
    },

    onBreakpointRemoved: function(bp)
    {
        this.refresh();
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(BreakpointPanel);

return BreakpointPanel;

// ********************************************************************************************* //
});
