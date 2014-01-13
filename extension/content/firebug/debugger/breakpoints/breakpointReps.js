/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/debugger/breakpoints/breakpoint",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/console/errors",
    "firebug/console/functionMonitor",
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Events, SourceLink, Css, Dom,
    Breakpoint, BreakpointStore, Errors, FunctionMonitor) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, FOR, H1, SPAN, TAG, INPUT} = Domplate;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BP");

// ********************************************************************************************* //
// Breakpoint Templates

Firebug.Breakpoint.BreakpointListRep = domplate(Firebug.Rep,
{
    tag:
        DIV({role : "list"},
            FOR("group", "$groups",
                DIV({"class": "breakpointBlock breakpointBlock-$group.name", role: "list",
                        $opened: "$group.opened", _repObject: "$group", onclick: "$onClick"},
                    H1({"class": "breakpointHeader groupHeader"},
                        DIV({"class": "twisty", role: "presentation"}),
                        SPAN({"class": "breakpointsHeaderLabel"}, "$group.title")
                    ),
                    DIV({"class": "breakpointsGroupListBox", role: "listbox"},
                        FOR("bp", "$group.breakpoints",
                            TAG("$bp|getBreakpointRep", {bp: "$bp"})
                        )
                    )
                )
            )
        ),

    getBreakpointRep: function(bp)
    {
        var rep = Firebug.getRep(bp, Firebug.currentContext);
        return rep.tag;
    },

    toggleGroup: function(node)
    {
        var panel = Firebug.getElementPanel(node);
        var groupNode = Dom.getAncestorByClass(node, "breakpointBlock");
        var group = Firebug.getRepObject(groupNode);

        Css.toggleClass(groupNode, "opened");
        var opened = Css.hasClass(groupNode, "opened");
        panel.groupOpened[group.name] = opened;

        if (opened)
        {
            var offset = Dom.getClientOffset(node);
            var titleAtTop = offset.y < panel.panelNode.scrollTop;
            Dom.scrollTo(groupNode, panel.panelNode, null,
                groupNode.offsetHeight > panel.panelNode.clientHeight ||
                titleAtTop ? "top" : "bottom");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var header = Dom.getAncestorByClass(event.target, "breakpointHeader");
        if (header)
        {
            this.toggleGroup(event.target);
            return;
        }
    }
});

// ********************************************************************************************* //

/**
 * @template
 */
Firebug.Breakpoint.BreakpointRep = domplate(Firebug.Rep,
/** @lends Firebug.Breakpoint.BreakpointRep */
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", $disabled: "$bp|isDisabled", role: "option",
                "aria-checked": "$bp|isEnabled", _repObject: "$bp", onclick: "$onClick"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp|isEnabled", tabindex : '-1'}),
                SPAN({"class": "breakpointName"}, "$bp|getName"),
                TAG(FirebugReps.SourceLink.tag, {object: "$bp|getSourceLink"}),
                SPAN({"class": "closeButton"})
            ),
            DIV({"class": "breakpointCode"}, "$bp|getSource")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getName: function(bp)
    {
        return bp.getName();
    },

    getSourceLink: function(bp)
    {
        // Convert line index(zero-based) to line number(one-based)
        var lineNo = bp.lineNo + 1;
        return new SourceLink(bp.href, lineNo, "js");
    },

    getSource: function(bp)
    {
        return bp.getSourceLine();
    },

    removeBreakpoint: function(groupName, href, lineNumber)
    {
        Trace.sysout("breakpointRep.removeBreakpoint; " + href + " (" + lineNumber + ")");

        if (groupName == "breakpoints")
        {
            BreakpointStore.removeBreakpoint(href, lineNumber);
        }
        else if (groupName == "errorBreakpoints")
        {
            Errors.clearErrorBreakpoint(href, lineNumber);
        }
        else if (groupName == "monitors")
        {
            FunctionMonitor.clearMonitorBreakpoint(href, lineNumber);
        }
    },

    enableBreakpoint: function(href, lineNumber)
    {
        BreakpointStore.enableBreakpoint(href, lineNumber);
    },

    disableBreakpoint: function(href, lineNumber)
    {
        BreakpointStore.disableBreakpoint(href, lineNumber);
    },

    isEnabled: function(bp)
    {
        return !bp.disabled;
    },

    isDisabled: function(bp)
    {
        return bp.disabled;
    },

    getContextMenuItems: function(breakpoint, target)
    {
        var head = Dom.getAncestorByClass(target, "breakpointBlock");
        var groupName = Css.getClassValue(head, "breakpointBlock");

        var items = [{
            label: "breakpoints.Remove_Breakpoint",
            tooltiptext: "breakpoints.tip.Remove_Breakpoint",
            command: Obj.bindFixed(this.removeBreakpoint, this, groupName,
                breakpoint.href, breakpoint.lineNo)
        }];

        if (groupName == "breakpoints")
        {
            if (!breakpoint.disabled)
            {
                items.push({
                    label: "breakpoints.Disable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Disable_Breakpoint",
                    command: Obj.bindFixed(this.disableBreakpoint, this, breakpoint.href,
                        breakpoint.lineNo)
                });
            }
            else
            {
                items.push({
                    label: "breakpoints.Enable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Enable_Breakpoint",
                    command: Obj.bindFixed(this.enableBreakpoint, this, breakpoint.href,
                        breakpoint.lineNo)
                });
            }
        }

        items.push(
             "-"
        );

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Reps

    supportsObject: function(object, type)
    {
        return (object instanceof Breakpoint);
    },

    onClick: function(event)
    {
        var panel = Firebug.getElementPanel(event.target);
        var row = Dom.getAncestorByClass(event.target, "breakpointRow");
        var bp = row.repObject;

        this.disablePanelRefresh(panel, function()
        {
            if (Dom.getAncestorByClass(event.target, "breakpointCheckbox"))
            {
                var checkBox = event.target;
                if (checkBox.checked)
                {
                    this.enableBreakpoint(bp.href, bp.lineNo);
                    row.setAttribute("aria-checked", "true");
                }
                else
                {
                    this.disableBreakpoint(bp.href, bp.lineNo);
                    row.setAttribute("aria-checked", "false");
                }
            }
            else if (Dom.getAncestorByClass(event.target, "closeButton"))
            {
                var head = Dom.getAncestorByClass(event.target, "breakpointBlock");
                var groupName = Css.getClassValue(head, "breakpointBlock");
                this.removeBreakpoint(groupName, bp.href, bp.lineNo);
            }
        });

        panel.refresh();
    },

    disablePanelRefresh: function(panel, callback)
    {
        try
        {
            panel.noRefresh = true;

            callback.bind(this)();
        }
        catch (e)
        {
            TraceError.sysout("breakpointReps.doNotRefreshPanel; EXCEPTION " + e, e);
        }
        finally
        {
            panel.noRefresh = false;
        }
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(Firebug.Breakpoint.BreakpointRep);

return Firebug.Breakpoint.BreakpointListRep;

// ********************************************************************************************* //
});
