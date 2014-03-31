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
    "firebug/debugger/clients/grip",
    "firebug/debugger/clients/scopeClient",
    "firebug/debugger/watch/watchExpression",
    "firebug/debugger/watch/watchProvider",
],
function(Firebug, FBTrace, Obj, Domplate, Events, Dom, Css, Arr, DomBaseTree, Locale,
    Grip, ScopeClient, WatchExpression, WatchProvider) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, TD, TR, TABLE, TBODY} = Domplate;

var Trace = FBTrace.to("DBG_WATCH");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DOM Tree Implementation

function WatchTree(context, provider, memberProvider)
{
    DomBaseTree.call(this, context, provider);

    this.memberProvider = memberProvider;
}

/**
 * @domplate This tree widget extends {@link DomBaseTree} and appends support for watch expressions.
 * The tree is responsible for rendering content within the {@link WatchPanel}.
 */
var BaseTree = DomBaseTree.prototype;
WatchTree.prototype = domplate(BaseTree,
/** @lends WatchTree */
{
    watchNewRowTag:
        TR({"class": "watchNewRow", level: 0},
            TD({"class": "watchEditCell", colspan: 3},
                DIV({"class": "watchEditBox a11yFocusNoTab", role: "button", tabindex: "0",
                    "aria-label": Locale.$STR("a11y.labels.press enter to add new watch expression")},
                        Locale.$STR("NewWatch")
                )
            )
        ),

    tag:
        TABLE({"class": "domTable watchTable", cellpadding: 0, cellspacing: 0,
            _domPanel: "$domPanel", onclick: "$onClick", role: "tree"},
            TBODY({role: "presentation"},
                TAG("$watchNewRow|getWatchNewRowTag"),
                FOR("member", "$object|memberIterator", 
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    emptyTag:
        TR(
            TD({colspan: 3})
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
        // Checking the object type must be done after checking object instance (see issue 6953).

        // Customize CSS style for a memberRow. The type creates additional class name
        // for the row: 'type' + Row. So, the following creates "scopesRow" class that
        // decorates Scope rows.
        // Always use 'instanceof' when checking specific object properties. Even content
        // object can appear here.
        if (object instanceof ScopeClient)
        {
            return "scopes";
        }
        else if (object instanceof WatchExpression)
        {
            return "watch";
        }
        else if (object instanceof WatchProvider.FrameResultObject)
        {
            // Return a different class when the return value has already been emphasized.
            if (!object.alreadyEmphasized)
                return "frameResultValue";
            else
                return "frameResultValueEmphasized";
        }
        else if (object instanceof Grip)
        {
            if (object.getType() == "function")
            {
                return "userFunction";
            }
        }

        return BaseTree.getType.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // xxxHonza: we might want to move this into {@link DomBaseTree} to use the same logic
    // within the DOM panel.
    createMember: function(type, name, value, level, hasChildren)
    {
        var member = BaseTree.createMember.apply(this, arguments);

        // Disable editing for read only values.
        if (value instanceof Grip)
            member.readOnly = value.readOnly;

        member.deletable = true;

        return member;
    }
});

// ********************************************************************************************* //
// Registration

return WatchTree;

// ********************************************************************************************* //
});
