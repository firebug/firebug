/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/dom/domMemberProvider",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/clients/clientProvider",
    "firebug/debugger/clients/scopeClient",
    "firebug/debugger/clients/grip",
    "firebug/debugger/watch/returnValueModifier",
    "firebug/debugger/watch/watchExpression",
],
function (FBTrace, Obj, Locale, Wrapper, DOMMemberProvider, DebuggerLib, StackFrame,
    ClientProvider, ScopeClient, Grip, ReturnValueModifier, WatchExpression) {

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
        if (localObject != null)
            return localObject;

        return BaseProvider.getValue.apply(this, arguments);
    },

    getLabel: function(object)
    {
        // If the debugger is resumed the {@link WatchPanel} displays list of user expressions
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
        if (object instanceof WatchExpression)
            return this.memberProvider.hasChildren(object.value);

        // If we have a local JS object, use the member provider for that.
        var localObject = this.getLocalObject(object);
        if (localObject)
            return this.memberProvider.hasChildren(localObject);

        return BaseProvider.hasChildren.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Scopes

    getScopes: function(stackFrame)
    {
        if (stackFrame.scopes)
            return stackFrame.scopes;

        stackFrame.scopes = [];

        var cache = stackFrame.context.clientCache;

        // If frame-return value is available display it in the Watch panel too.
        // (together with the scope chain).
        var clientObject = this.getFrameResultObject(stackFrame, cache);
        if (clientObject)
            stackFrame.scopes.push(clientObject);

        // Append 'this' as the first scope. This is not a real scope provided by
        // the back-end, but it's useful for debugging.
        var thisGrip = stackFrame.nativeFrame["this"];
        var thisScope = new ScopeClient(thisGrip, cache)
        thisScope.value = cache.getObject(thisGrip);
        thisScope.name = "this";
        stackFrame.scopes.push(thisScope);

        // Now iterate all real scopes. This represents the chain of scopes
        // in the {@link WatchPanel}.
        var scope = stackFrame.nativeFrame.environment;
        while (scope)
        {
            // xxxHonza: All instances of the ScopeClient should be probably
            // created by {@link ClientFactory}.
            stackFrame.scopes.push(new ScopeClient(scope, cache));
            scope = scope.parent;
        }

        return stackFrame.scopes;
    },

    getTopScope: function(stackFrame)
    {
        // Return the first real scope object.
        var scopes = this.getScopes(stackFrame);
        for (var i = 0; i < scopes.length; i++)
        {
            var scope = scopes[i];
            if (!(scope instanceof ScopeClient))
                continue;

            // Ignore 'this' scope (not real scope).
            if (scope.name == "this")
                continue;

            return scope;
        }
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
        var localObject = this.getLocalObject(object);
        if (localObject)
            return this.memberProvider.getMembers(localObject, level);

        // return null to symbolize that the member provider method getMember
        // failed, and the provider method getChildren must be used instead.
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
        if (object instanceof ScopeClient)
        {
            if (object.grip.object)
            {
                var actor = object.grip.object.actor;
                if (!actor)
                    return null;

                return DebuggerLib.getObject(this.panel.context, actor);
            }
        }

        return BaseProvider.getLocalObject.apply(this, arguments);
    },

    /**
     * Adds the frame result object (<exception> or <return value>) if it exists to the scopes
     * listed in the watch panel (even if it is not a scope).
     *
     * @param {object} stackFrame
     * @param {object} cache
     *
     * @return {WatchProvider.FrameResultObject} The object storing the name and the value of the
     *  frame result object.
     */
    getFrameResultObject: function(stackFrame, cache)
    {
        var frameResultObj = null;
        var context = stackFrame.context;

        var debuggerTool = context.getTool("debugger");
        // Fetch the return value changed by the user (if they did so).
        // Note: userReturnValue is null only if the value is not found (null is not a valid grip).
        var userReturnValue = ReturnValueModifier.getUserReturnValueAsGrip(context);

        // If the user hasn't changed the return value, get the initial frame result object.
        if (userReturnValue == null)
            frameResultObj = DebuggerLib.getFrameResultObject(context);
        else
            frameResultObj = {type: "return", value: userReturnValue};

        Trace.sysout("WatchProvider.getFrameResultObject; frameResultObj", frameResultObj);

        if (!frameResultObj || !frameResultObj.type)
            return;

        // Create an object that represents the frame-result value in the {@link WatchPanel}.
        var clientObject = cache.getObject(frameResultObj.value);

        // Make exceptions readonly.
        var readOnly = (frameResultObj.type === "exception");

        var resultObject = new WatchProvider.FrameResultObject(
            clientObject, frameResultObj.type, readOnly);

        Trace.sysout("watchProvider.getFrameResultObject; object:", clientObject);

        return resultObject;
    },
});

// ********************************************************************************************* //
// Return Value Object

WatchProvider.FrameResultObject = function(value, type, readOnly)
{
    // Call the constructor of the super class and provide value as the grip object.
    Grip.call(this, value);
    // Extend the object with other properties.
    this.value = value;
    this.readOnly = !!readOnly;
    this.name = Locale.$STR("watch.frameResultType." + type);
}

/**
 * @object Represents frame-result value. We need a new type for this value since it
 * has its own representation in the Watch panel. For example, if return value from
 * a function is |this| we want to display "return value" instead of "this" as the label
 * (see also issue 7095).
 */
WatchProvider.FrameResultObject.prototype = Obj.descend(Grip.prototype,
/** @link WatchProvider.FrameResultObject */
{
    getName: function()
    {
        return this.name;
    },

    getActor: function()
    {
        return this.value.getActor();
    },

    getValue: function()
    {
        return this.value.getValue();
    },

    hasProperties: function()
    {
        return this.value.hasProperties();
    },

    getChildren: function()
    {
        return this.value.getProperties();
    }
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
    this.panel = panel;
}

WatchProvider.DefaultWatchPanelInput.prototype.getChildren = function()
{
    var children = [];
    children.push.apply(children, this.panel.watches);
    var global = this.panel.context.getCurrentGlobal();
    children.push(Wrapper.getContentView(global));
    return children;
}

// ********************************************************************************************* //
// Registration

return WatchProvider;

// ********************************************************************************************* //
});
