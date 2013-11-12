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
        // Customize CSS style for a memberRow. The type creates additional class name
        // for the row: 'type' + Row. So, the following creates "scopesRow" class that
        // decorates Scope rows.
        if (object instanceof ScopeClient)
            return "scopes";
        else if (object instanceof WatchExpression)
            return "watch";

        // xxxHonza: this must be done through a decorator that can be also reused
        // in the DOM panel (applying types like: userFunction, DOM Function, domClass, etc.)
        // Checking the object type must be done after checking object instance (see issue 6953).
        if (object && Obj.isFunction(object.getType))
        {
            if (object.getType() == "function")
                return "userFunction";
        }

        return BaseTree.getType.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

return WatchTree;

// ********************************************************************************************* //
});
