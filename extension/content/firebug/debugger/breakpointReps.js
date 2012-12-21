/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/js/sourceLink",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/debugger/breakpoint",
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Events, SourceLink, Css, Dom, Breakpoint) {
with (Domplate) {

// ********************************************************************************************* //
// Breakpoint Reps

Firebug.JSD2.Breakpoint.BreakpointListRep = domplate(Firebug.Rep,
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

Firebug.JSD2.Breakpoint.BreakpointRep = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "breakpointRow focusRow", $disabled: "$bp|isDisabled", role: "option",
                "aria-checked": "$bp.checked", _repObject: "$bp", onclick: "$onClick"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp|isEnabled", tabindex : '-1'}),
                SPAN({"class": "breakpointName"}, "$bp.name"),
                TAG(FirebugReps.SourceLink.tag, {object: "$bp|getSourceLink"}),
                IMG({"class": "closeButton", src: "blank.gif"})
            ),
            DIV({"class": "breakpointCode"}, "$bp.sourceLine")
        ),

    getSourceLink: function(bp)
    {
        return new SourceLink.SourceLink(bp.href, bp.lineNumber, "js");
    },

    removeBreakpoint: function(groupName, href, lineNumber)
    {
        if (groupName == "breakpoints")
            FBS.clearBreakpoint(href, lineNumber);
        else if (groupName == "errorBreakpoints")
            FBS.clearErrorBreakpoint(href, lineNumber);
        else if (groupName == "monitors")
            FBS.unmonitor(href, lineNumber);
    },

    enableBreakpoint: function(href, lineNumber)
    {
        FBS.enableBreakpoint(href, lineNumber);
    },

    disableBreakpoint: function(href, lineNumber)
    {
        FBS.disableBreakpoint(href, lineNumber);
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
                breakpoint.href, breakpoint.lineNumber)
        }];

        if (groupName == "breakpoints")
        {
            if (breakpoint.checked)
            {
                items.push({
                    label: "breakpoints.Disable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Disable_Breakpoint",
                    command: Obj.bindFixed(this.disableBreakpoint, this, breakpoint.href,
                        breakpoint.lineNumber)
                });
            }
            else
            {
                items.push({
                    label: "breakpoints.Enable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Enable_Breakpoint",
                    command: Obj.bindFixed(this.enableBreakpoint, this, breakpoint.href,
                        breakpoint.lineNumber)
                });
            }
        }

        items.push(
             "-"
        );

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    inspectable: false,

    supportsObject: function(object, type)
    {
        return (object instanceof Breakpoint);  // FIXME moz back end
    },

    onClick: function(event)
    {
        var panel = Firebug.getElementPanel(event.target);

        if (Dom.getAncestorByClass(event.target, "breakpointCheckbox"))
        {
            var node = event.target.parentNode.getElementsByClassName(
                "objectLink-sourceLink").item(0);

            if (!node)
                return;

            var sourceLink = node.repObject;

            panel.noRefresh = true;
            var checkBox = event.target;
            var bpRow = Dom.getAncestorByClass(checkBox, "breakpointRow");

            if (checkBox.checked)
            {
                this.enableBreakpoint(sourceLink.href, sourceLink.line);
                bpRow.setAttribute("aria-checked", "true");
            }
            else
            {
                this.disableBreakpoint(sourceLink.href, sourceLink.line);
                bpRow.setAttribute("aria-checked", "false");
            }
            panel.noRefresh = false;
        }
        else if (Dom.getAncestorByClass(event.target, "closeButton"))
        {
            panel.noRefresh = true;
            var sourceLink = event.target.parentNode.getElementsByClassName(
                "objectLink-sourceLink").item(0).repObject;

            var head = Dom.getAncestorByClass(event.target, "breakpointBlock");
            var groupName = Css.getClassValue(head, "breakpointBlock");

            this.removeBreakpoint(groupName, sourceLink.href, sourceLink.line);

            panel.noRefresh = false;
        }

        panel.refresh();
    }
})};

// ********************************************************************************************* //
// Registration

Firebug.registerRep(Firebug.JSD2.Breakpoint.BreakpointRep);

return Firebug.JSD2.Breakpoint.BreakpointListRep;

// ********************************************************************************************* //
});
