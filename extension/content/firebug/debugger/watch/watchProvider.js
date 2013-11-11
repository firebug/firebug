/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/debugger/clients/clientProvider",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/clients/scopeClient",
    "firebug/dom/domMemberProvider",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/watch/watchExpression",
],
function (FBTrace, Obj, Locale, ClientProvider, StackFrame, ScopeClient, DOMMemberProvider, 
    DebuggerLib, WatchExpression) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_WATCHPROVIDER");

// ********************************************************************************************* //
// Watch Panel Provider

function WatchProvider(panel)
{
    this.panel = panel;
    this.memberProvider = new DOMMemberProvider(panel.context);
}

/**
 * @provider This object represents a default provider for the Watch panel.
 * The provider is responsible for joining the list of user-expressions with the
 * list of current scopes (all displayed when the debugger is halted). In the
 * debugger is resumed global scope (usually a window) is displayed.
 *
 * The Watch panel provider uses two ways to get data:
 * 1) Asynchronously over the RDP (e.g. frames, user-expressions evaluated results,
 *      function scope, etc.),
 * 2) Synchronously through direct access to the server side (JS objects).
 *
 * xxxHonza: add #2) This is a hack that allows Firebug to adopt JSD2 faster. It should be
 * removed as soon as remote debugging is supported.
 */
var BaseProvider = ClientProvider.prototype;
WatchProvider.prototype = Obj.extend(BaseProvider,
/** @lends WatchProvider */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Data Provider

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

    getValue: function(object)
    {
        var localObject = this.getLocalObject(object);
        if (localObject)
            return localObject;

        return BaseProvider.getValue.apply(this, arguments);
    },

    getLabel: function(object)
    {
        // If the debugger is resumed the {@WatchPanel} displays list of user expressions
        // and the current global scope, top level window or an iframe set using cd().
        // The window is labeled as 'window'. It could be a bit better to use 'this' but,
        // the expanded state would be remembered and used even for the case when the 
        // debugger is halted ('this' is one of the scopes).
        // xxxHonza: there must be a way how to provide better ID - not a label during
        // the tree restoration process.
        if (object instanceof Window)
            return "window";

        return BaseProvider.getLabel.apply(this, arguments);
    },

    hasChildren: function(object)
    {
        // If the base provider says, the object has children, let's go with it.
        if (BaseProvider.hasChildren.apply(this, arguments))
            return true;

        // ... otherwise we need to try to get the local object (breaking RDP)
        // and check if it has any JS members.
        object = this.getLocalObject(object);
        if (object)
            return Obj.hasProperties(object);

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Scopes

    getScopes: function(stackFrame)
    {
        if (stackFrame.scopes)
            return stackFrame.scopes;

        stackFrame.scopes = [];

        var cache = stackFrame.context.clientCache;

        this.appendFrameResultValueInScope(stackFrame, cache);

        // Append 'this' as the first scope. This is not a real 'scope',
        // but useful for debugging.
        var thisScope = cache.getObject(stackFrame.nativeFrame["this"]);
        thisScope.name = "this";
        thisScope.readOnly = true;
        stackFrame.scopes.push(thisScope);

        // Now iterate all parent scopes. This represents the chain of scopes
        // in the Watch panel.
        var scope = stackFrame.nativeFrame.environment;
        while (scope)
        {
            stackFrame.scopes.push(new ScopeClient(scope, cache, {readOnly: true}));
            scope = scope.parent;
        }

        return stackFrame.scopes;
    },

    getTopScope: function(stackFrame)
    {
        var scopes = this.getScopes(stackFrame);
        return (scopes.length > 1) ? scopes[1] : null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Member Provider

    getMembers: function(object, level)
    {
        Trace.sysout("watchProvider.getMembers; level: " + level, object);

        // The default watch panel input is used when the debugger is resumed.
        if (object instanceof WatchProvider.DefaultWatchPanelInput)
            return null;

        // User watch expression can be expandable if its value is an object
        // with JS properties.
        if (object instanceof WatchExpression)
            return this.memberProvider.getMembers(object.value, level);

        // If the object is a grip, let's try to get the local JS object (breaks RDP)
        // and return its JS properties.
        object = this.getLocalObject(object);
        if (object)
            return this.memberProvider.getMembers(object, level);

        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // ID Provider

    getId: function(object)
    {
        var label = this.getLabel(object);
        if (label)
            return label;

        if (typeof(object.getActor) == "function")
            return object.getActor();

        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private Helpers

    /**
     * This is the place where we break the RDP feature and access server side objects
     * locally. It's used for providing data to the Watch panel.
     *
     * @param {Object} object Client object with an actor.
     */
    getLocalObject: function(object)
    {
        var actor;

        if (object instanceof ScopeClient)
        {
            if (object.grip.object)
                actor = object.grip.object.actor;
        }
        else if (typeof(object.getActor) == "function")
        {
            actor = object.getActor();
        }
        else
        {
            // The object is already the underlying JS object.
            return object;
        }

        if (!actor)
            return null;

        return DebuggerLib.getObject(this.panel.context, actor);
    },

    /**
     * Adds the frame result (<exception> or <return value>) if it exists to the scopes
     * listed in the watch panel (even if it is not a scope).
     *
     * @param {object} stackFrame
     * @param {object} cache
     */
    appendFrameResultValueInScope: function(stackFrame, cache)
    {
        var frameResultObj = DebuggerLib.getFrameResultObject(stackFrame.context);
        if (!frameResultObj || !frameResultObj.type)
            return;

        var frameResultScope = cache.getObject(frameResultObj.value);

        frameResultScope.name = Locale.$STR("watch.frameResultType." + frameResultObj.type);
        frameResultScope.isFrameResultValue = true;
        frameResultScope.readOnly = true;

        Trace.sysout("WatchProvider.appendFrameResultValueInScope; frameResultScope",
            frameResultScope);

        stackFrame.scopes.push(frameResultScope);
    },
});

// ********************************************************************************************* //
// DefaultWatchPanelInput

/**
 * Used as an input object for the Watch panel in case the debugger is resumed.
 * The object has the following children:
 * 1) User watch expressions
 * 2) The current global scope (top level window, or the current iframe)
 */
WatchProvider.DefaultWatchPanelInput = function(panel)
/** @lends WatchProvider.DefaultWatchPanelInput */
{
    this.panel = panel
}

WatchProvider.DefaultWatchPanelInput.prototype.getChildren = function()
{
    var children = [];
    children.push.apply(children, this.panel.watches);
    children.push(this.panel.context.getCurrentGlobal());
    return children;
}

// ********************************************************************************************* //
// Registration

return WatchProvider;

// ********************************************************************************************* //
});
