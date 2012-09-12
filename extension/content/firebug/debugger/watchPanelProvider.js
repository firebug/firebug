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
        if (object instanceof StackFrame || object instanceof Grips.Scope)
            return this.getChildren(object).length > 0;

        return BaseProvider.hasChildren.apply(this, arguments);
    },

    getChildren: function(object)
    {
        if (object instanceof StackFrame)
            return object.getScopes();
        else if (object instanceof Grips.Scope)
            return object.getProperties();

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
