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
],
function(Obj, Firebug, Domplate, Events, Dom, Css, Arr, DomTree, Locale) {
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
WatchTree.prototype = domplate(new DomTree(),
{
    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0,
               _toggles: "$toggles", _domPanel: "$domPanel", onclick: "$onClick", role: "tree"},
            TBODY({role: "presentation"},
                TR({"class": "watchNewRow", level: 0},
                    TD({"class": "watchEditCell", colspan: 3},
                        DIV({"class": "watchEditBox a11yFocusNoTab", role: "button", tabindex: "0",
                            "aria-label": Locale.$STR("a11y.labels.press enter to add new watch expression")},
                                Locale.$STR("NewWatch")
                        )
                    )
                ),
                FOR("member", "$object|memberIterator", 
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        )
});

// ********************************************************************************************* //
// Registration

return WatchTree;

// ********************************************************************************************* //
}});

