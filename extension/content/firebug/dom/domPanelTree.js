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

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Globals

var dummyElement;

// ********************************************************************************************* //
// DOM Tree Implementation

function DomPanelTree(context, provider, memberProvider)
{
    DomBaseTree.call(this, context, provider);

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
            TD({width: "20%"}),
            TD(),
            TD({width: "80%"})
        ),

    memberRowTag:
        TR({"class": "memberRow $member.open $member.type\\Row",
            _domObject: "$member",
            _repObject: "$member",
            $hasChildren: "$member|hasChildren",
            $cropped: "$member.value|isCropped",
            $repIgnore: true,
            role: "presentation",
            level: "$member.level",
            breakable: "$member.breakable",
            breakpoint: "$member.breakpoint",
            disabledBreakpoint: "$member.disabledBreakpoint"},
            TD({"class": "memberHeaderCell"},
                DIV({"class": "sourceLine memberRowHeader", onclick: "$onClickBreakpointColumn"})
            ),
            TD({"class": "memberLabelCell", style: "padding-left: $member.indent\\px",
                role: "presentation"},
                DIV({"class": "memberLabel $member.type\\Label", title: "$member.title"},
                    SPAN({"class": "memberLabelPrefix"}, "$member.prefix"),
                    SPAN({title: "$member|getMemberNameTooltip"}, "$member.name")
                )
            ),
            TD({"class": "memberValueIcon", $readOnly: "$member.readOnly"},
                DIV()
            ),
            TD({"class": "memberValueCell", $readOnly: "$member.readOnly",
                role: "presentation"},
                TAG("$member.tag", {object: "$member|getMemberValue"})
            )
        ),

    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick",
            _repObject: "$object", role: "tree",
            "aria-label": Locale.$STR("a11y.labels.dom_properties")},
            TBODY({role: "presentation"},
                TAG("$sizerRowTag"),
                FOR("member", "$object|memberIterator",
                    TAG("$memberRowTag", {member: "$member"})
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Accessors

    getMemberValue: function(member)
    {
        // xxxHonza: the return value is passed into TAG that can be evaluated to
        // FirebugReps.Obj. This template is based on OBJECTLINK, which assigns
        // the value to |repObject| expando of the target node. In case where the
        // value is referencing an object coming from chrome scope the assignment
        // fails with an exception:
        // Permission denied for <resource://firebugui> to create wrapper
        // (see issue 7138 and DomplateTag.generateDOM method)
        //
        // The right solution seems to be passing the |member| structure into TAG template
        // (i.e. return it from this method), and cause the A.repObject (created by
        // OBJECTLINK) to reference it instead of referencing the member.value directly
        // (which points to chrome object).
        // This has impact on other parts of the UI where object links are used (e.g. the
        // Console panel, onPanelClick in firebug/chrome/chrome, and possibly extensions).
        //
        // For now, just fail if the object is such a chrome scope object, it's better
        // than breaking the UI.
        try
        {
            if (!dummyElement)
            {
                var doc = Firebug.chrome.getElementById("fbPanelBar1").browser.contentDocument;
                dummyElement = doc.createElement("dummy");
            }
            dummyElement.expando = member.value;
            return member.value;
        }
        catch (exc)
        {
            TraceError.sysout("DomPanelTree.getMemberValue FAILS for chrome object " + member.name, exc);
            return undefined;
        }
    },

    /**
     * Override the derived method since this tree template uses different domplate
     * template for the row tag (DOM panel has an extra breakpoint column).
     */
    getRowTag: function(member)
    {
        return this.memberRowTag;
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

        var panel = Firebug.getElementPanel(row);

        // Set the breakpoint only if the script panel will respond.
        var scriptPanel = panel.context.getPanel("script", true);
        if (!scriptPanel || !scriptPanel.isEnabled())
            return;

        panel.breakOnProperty(row);
    }
});

// ********************************************************************************************* //
// Registration

return DomPanelTree;

// ********************************************************************************************* //
});
