/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/clients/clientProvider",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/clients/scopeClient",
],
function (FBTrace, Obj, ClientProvider, StackFrame, ScopeClient) {

// ********************************************************************************************* //
// Watch Panel Provider

function WatchPanelProvider(panel)
{
    this.panel = panel;
}

/**
 * @provider The object represent a custom provider for the Watch panel.
 * The provider is responsible for joining list of user-expressions with the
 * list of the current scopes (displayed when the debugger is halted).
 */
var BaseProvider = ClientProvider.prototype;
WatchPanelProvider.prototype = Obj.extend(BaseProvider,
/** @lends WatchPanelProvider */
{
    getChildren: function(object)
    {
        if (object instanceof StackFrame)
        {
            var children = [];
            children.push.apply(children, this.panel.watches);
            children.push.apply(children, this.getScopes(object));
            return children;
        }

        return BaseProvider.getChildren.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Scopes

    getScopes: function(stackFrame)
    {
        if (stackFrame.scopes)
            return stackFrame.scopes;

        stackFrame.scopes = [];

        var cache = stackFrame.context.gripCache;

        // Append 'this' as the first scope. This is not a real 'scope',
        // but useful for debugging.
        var thisScope = cache.getObject(stackFrame.nativeFrame["this"]);
        thisScope.name = "this";
        stackFrame.scopes.push(thisScope);

        // Now iterate all parent scopes. This represents the chain of scopes
        // in the Watch panel.
        var scope = stackFrame.nativeFrame.environment;
        while (scope)
        {
            stackFrame.scopes.push(new ScopeClient(scope, cache));
            scope = scope.parent;
        }

        return stackFrame.scopes;
    },

    getTopScope: function(stackFrame)
    {
        var scopes = this.getScopes(stackFrame);
        return (scopes.length > 1) ? scopes[1] : null;
    }
});

// ********************************************************************************************* //
// Registration

return WatchPanelProvider;

// ********************************************************************************************* //
});
