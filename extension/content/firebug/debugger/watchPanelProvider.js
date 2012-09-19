/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/gripProvider",
    "firebug/debugger/stackFrame",
],
function (FBTrace, Obj, GripProvider, StackFrame) {

// ********************************************************************************************* //
// Watch Panel Provider

function WatchPanelProvider(panel)
{
    this.panel = panel;
}

/**
 * @provider
 */
var BaseProvider = GripProvider.prototype;
WatchPanelProvider.prototype = Obj.extend(BaseProvider,
/** @lends WatchPanelProvider */
{
    getChildren: function(object)
    {
        if (object instanceof StackFrame)
        {
            var children = [];
            children.push.apply(children, this.panel.watches);
            children.push.apply(children, object.getScopes());
            return children;
        }

        return BaseProvider.getChildren.call(this, object);
    },
});

// ********************************************************************************************* //
// Registration

return WatchPanelProvider;

// ********************************************************************************************* //
});
