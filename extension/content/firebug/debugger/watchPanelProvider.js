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

function WatchPanelProvider(panel)
{
    this.panel = panel;
    this.cache = panel.context.debuggerClient.activeThread.gripCache;
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

        if (object instanceof Grips.WatchExpression)
            object = object.value;

        return BaseProvider.hasChildren.call(this, object);
    },

    getChildren: function(object)
    {
        if (object instanceof StackFrame)
        {
            var children = [];
            children.push.apply(children, this.panel.watches);
            children.push.apply(children, object.getScopes());
            return children;
        }

        if (object instanceof Grips.Scope)
            return object.getProperties(this.cache);

        if (object instanceof Grips.WatchExpression)
            object = object.value;

        return BaseProvider.getChildren.call(this, object);
    },

    getLabel: function(object)
    {
        if (object instanceof Grips.WatchExpression)
            return object.expr;
        else if (object instanceof Grips.Scope)
            return object.getName();

        return BaseProvider.getLabel.apply(this, arguments);
    },

    getValue: function(object)
    {
        if (object instanceof Grips.WatchExpression)
            return object.value;
        else if (object instanceof Grips.Scope)
            return object.getValue();

        return BaseProvider.getValue.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

return WatchPanelProvider;

// ********************************************************************************************* //
});
