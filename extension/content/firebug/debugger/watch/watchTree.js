/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/chrome/domTree",
    "firebug/lib/locale",
    "firebug/debugger/clients/scopeClient",
    "firebug/debugger/watch/watchExpression",
],
function(Obj, Firebug, Domplate, Events, Dom, Css, Arr, DomTree, Locale, ScopeClient, WatchExpression) {
with (Domplate) {

// ********************************************************************************************* //
// DOM Tree Implementation

function WatchTree(provider)
{
    this.provider = provider;
}

/**
 * @domplate Represents a tree of properties/objects
 */
var BaseTree = DomTree.prototype;
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
               _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick", role: "tree"},
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
        // in the DOM panel (applying types like: userFunction, dom Function, domClass, etc.)

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

        return BaseTree.getType.apply(this, arguments);
    }
});

// ********************************************************************************************* //
// Registration

return WatchTree;

// ********************************************************************************************* //
}});

