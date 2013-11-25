/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/dom/domBaseTree",
],
function(Firebug, FBTrace, Obj, Domplate, Events, Dom, Css, Locale, Events, Options,
    DomBaseTree) {

// ********************************************************************************************* //
// Constants

var {domplate, TABLE, TBODY, TR, TD, DIV, SPAN, TAG, FOR} = Domplate;

var Trace = FBTrace.to("DBG_WATCH");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// DOM Tree Implementation

function DomPanelTree(provider, memberProvider)
{
    DomBaseTree.call(this);

    this.provider = provider;
    this.memberProvider = memberProvider;
}

/**
 * @domplate Represents a tree of properties/objects rendered within the main DOM panel.
 * Note that the tree is derived from {@DomBaseTree} and appends a breakpoint column to the UI.
 */
var BaseTree = DomBaseTree.prototype;
DomPanelTree.prototype = domplate(BaseTree,
/** @lends DomPanelTree */
{
    sizerRowTag:
        TR({role: "presentation"},
            TD(),
            TD({width: "30%"}),
            TD({width: "70%"})
        ),

    memberRowTag:
        TR({"class": "memberRow $member.open $member.type\\Row",
            _domObject: "$member",
            _repObject: "$member",
            $hasChildren: "$member|hasChildren",
            $cropped: "$member.value|isCropped",
            role: "presentation",
            level: "$member.level",
            breakable: "$member.breakable",
            breakpoint: "$member.breakpoint",
            disabledBreakpoint: "$member.disabledBreakpoint"},
            TD({"class": "memberHeaderCell"},
                DIV({"class": "sourceLine memberRowHeader", onclick: "$onClickBreakpointColumn"},
                    "&nbsp;"
               )
            ),
            TD({"class": "memberLabelCell", style: "padding-left: $member.indent\\px",
                role: "presentation"},
                DIV({"class": "memberLabel $member.type\\Label", title: "$member.title"},
                    SPAN({"class": "memberLabelPrefix"}, "$member.prefix"),
                    SPAN({title: "$member|getMemberNameTooltip"}, "$member.name")
                )
            ),
            TD({"class": "memberValueCell", $readOnly: "$member.readOnly",
                role: "presentation"},
                TAG("$member.tag", {object: "$member.value"})
            )
        ),

    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick",
            _repObject: "$object", role: "tree",
            "aria-label": Locale.$STR("aria.labels.dom properties")},
            TBODY({role: "presentation"},
                TAG("$sizerRowTag"),
                FOR("member", "$object|memberIterator",
                    TAG("$memberRowTag", {member: "$member"})
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Accessors

    /**
     * Override the derived method since this tree template uses different domplate
     * template for the row tag (DOM panel has an extra breakpoint column).
     */
    getRowTag: function(member)
    {
        return this.memberRowTag;
    },

    memberIterator: function(object)
    {
        return this.memberProvider.getMembers(object, 0);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    onClickBreakpointColumn: function(event)
    {
        Events.cancelEvent(event);

        var rowHeader = event.target;
        if (!Css.hasClass(rowHeader, "memberRowHeader"))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        if (!row)
            return;

        var panel = row.parentNode.parentNode.domPanel;
        if (panel)
        {
            var scriptPanel = panel.context.getPanel("script", true);

            // set the breakpoint only if the script panel will respond.
            if (!scriptPanel || !scriptPanel.isEnabled())
                return;

            panel.breakOnProperty(row);
        }
    }
});

// ********************************************************************************************* //
// Registration

return DomPanelTree;

// ********************************************************************************************* //
});
