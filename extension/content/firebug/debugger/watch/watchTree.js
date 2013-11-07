/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/dom/domBaseTree",
    "firebug/lib/locale",
    "firebug/debugger/clients/scopeClient",
    "firebug/debugger/watch/watchExpression",
],
function(Firebug, FBTrace, Obj, Domplate, Events, Dom, Css, Arr, DomBaseTree, Locale,
    ScopeClient, WatchExpression) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, TD, TR, TABLE, TBODY} = Domplate;

var Trace = FBTrace.to("DBG_WATCH");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// DOM Tree Implementation

function WatchTree(provider)
{
    this.provider = provider;
}

/**
 * @domplate Represents a tree of properties/objects
 */
var BaseTree = DomBaseTree.prototype;
WatchTree.prototype = domplate(BaseTree,
{
    watchNewRowTag:
        TR({"class": "watchNewRow", level: 0},
            TD({"class": "watchEditCell", colspan: 2},
                DIV({"class": "watchEditBox a11yFocusNoTab", role: "button", tabindex: "0",
                    "aria-label": Locale.$STR("a11y.labels.press enter to add new watch expression")},
                        Locale.$STR("NewWatch")
                )
            )
        ),

    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
            _domPanel: "$domPanel", onclick: "$onClick", role: "tree"},
            TBODY({role: "presentation"},
                TAG("$watchNewRow|getWatchNewRowTag"),
                FOR("member", "$object|memberIterator", 
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    emptyTag:
        TR(
            TD({colspan: 2})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getWatchNewRowTag: function(show)
    {
        return show ? this.watchNewRowTag : this.emptyTag;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getType: function(object)
    {
        // xxxHonza: this must be done through a decorator that can be also reused
        // in the DOM panel (applying types like: userFunction, DOM Function, domClass, etc.)

        if (object && Obj.isFunction(object.getType))
        {
            if (object.getType() == "function")
                return "userFunction";
        }

        // Customize CSS style for a memberRow. The type creates additional class name
        // for the row: 'type' + Row. So, the following creates "scopesRow" class that
        // decorates Scope rows.
        if (object instanceof ScopeClient)
            return "scopes";
        else if (object instanceof WatchExpression)
            return "watch";
        else if (object && object.isFrameResultValue)
            return "frameResultValue";

        return BaseTree.getType.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        var label = Dom.getAncestorByClass(event.target, "memberLabel");
        var valueCell = row.getElementsByClassName("memberValueCell").item(0);
        var target = row.lastChild.firstChild;
        var isString = Css.hasClass(target, "objectBox-string");
        var inValueCell = (event.target === valueCell || event.target === target);

        var repNode = Firebug.getRepNode(event.target);
        var memberRow = Css.hasClass(repNode, "memberRow");

        // Here, we are interested in the object associated with the value rep
        // (not the rep object associated with the row itself)
        var object = memberRow ? null : repNode.repObject;

        // Row member object created by the tree widget.
        var member = row.repObject;

        if (label && Css.hasClass(row, "hasChildren") && !(isString && inValueCell))
        {
            // Basic row toggling is implemented in {@DomTree}
            BaseTree.onClick.apply(this, arguments);
        }
        else
        {
            // 1) Click on functions navigates the user to the right source location
            // 2) Double click inverts boolean values and opens inline editor for others.
            if (typeof(object) == "function")
            {
                Firebug.chrome.select(object, "script");
                Events.cancelEvent(event);
            }
            else if (Events.isDoubleClick(event))
            {
                // The entire logic is part of the parent panel.
                var panel = Firebug.getElementPanel(row);
                if (!panel)
                    return;

                // Only primitive types can be edited.
                var value = panel.provider.getValue(member.value);
                if (typeof(value) == "object")
                    return;

                // Don't edit completion values.
                if (member.type === "frameResultValue")
                    return;

                if (typeof(value) == "boolean")
                    panel.setPropertyValue(row, "" + !value);
                else
                    panel.editProperty(row);

                Events.cancelEvent(event);
            }
        }
    },
});

// ********************************************************************************************* //
// Registration

return WatchTree;

// ********************************************************************************************* //
});
