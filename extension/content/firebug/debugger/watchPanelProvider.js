/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/gripProvider",
    "firebug/debugger/grips",
    "firebug/debugger/stackFrame",
],
function (FBTrace, Obj, GripProvider, Grips, StackFrame) {

// ********************************************************************************************* //
// Watch Panel Provider

function WatchPanelProvider(cache)
{
    this.cache = cache;
}

/**
 * @provider
 */
var BaseProvider = GripProvider.prototype;
WatchPanelProvider.prototype = Obj.extend(BaseProvider,
/** @lends WatchPanelProvider */
{
    hasChildren: function(object)
    {
        if (object instanceof StackFrame)
            return this.getChildren(object).length > 0;

        // xxxHonza: hack, the scope could be empty (= no children).
        if (object instanceof Grips.Scope)
            return true;

        return BaseProvider.hasChildren.apply(this, arguments);
    },

    getChildren: function(object)
    {
        if (object instanceof StackFrame)
            return object.getScopes();

        if (object instanceof Grips.Scope)
            return object.getProperties(this.cache);

        return BaseProvider.getChildren.apply(this, arguments);
    },

    getLabel: function(object)
    {
        if (object instanceof Grips.Scope)
            return object.getName();

        return BaseProvider.getLabel.apply(this, arguments);
    },

    getValue: function(object)
    {
        if (object instanceof Grips.Scope)
            return object.getValue();

        return BaseProvider.getValue.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

return WatchPanelProvider;

// ********************************************************************************************* //
});
