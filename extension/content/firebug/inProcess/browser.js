/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

define([], function factoryBrowser() {

// ************************************************************************************************
// Browser

/**
 * Proxy to a debuggable web browser. A browser may be remote and contain one or more
 * JavaScript execution contexts. Each JavaScript execution context may contain one or
 * more compilation units. A browser provides notification to registered listeners describing
 * events that occur in the browser.
 *
 * @constructor
 * @type Browser
 * @return a new Browser
 * @version 1.0
 */
function Browser()
{
    this.contexts = {}; // map of contexts, indexed by context ID
    this.activeContext = null;
    this.listeners = [];  // array of Browser.listener objects
    this.tools = {};  // registry of known tools
    this.connected = false;
}

// ************************************************************************************************
// API

Browser.debug = {handlers: true};
Browser.onDebug = function()
{
    if (Browser.debug)
        throw new Error("Browser.debug set but no Brower.onDebug is defined");
}

Browser.unimplementedHandler = function()
{
    if (Browser.debug && Browser.debug.handlers)
        Browser.onDebug("Browser.listener unimplemented event handler called ",
            {handler: this, args: arguments});
}

Browser.listener =
{
    onBreak: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onConsoleDebug: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onConsoleError: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onConsoleInfo: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onConsoleLog: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onConsoleWarn: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onContextCreated: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onContextDestroyed: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onContextChanged: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onContextLoaded: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onInspectNode: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onResume: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onScript: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onSuspend: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onToggleBreakpoint: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onBreakpointError: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
    onDisconnect: function() {
        Browser.unimplementedHandler.apply(this, arguments);
    },
};
/*
 * Testing and sanity: clearAllBreakpoints
 */
Browser.prototype.clearAllBreakpoints = function()
{
    Firebug.Debugger.clearAllBreakpoints();
}


Browser.Tool = function(name)
{
    this.toolName = name;
    this.active = false;
}

Browser.Tool.prototype =
{
    getName: function()
    {
        return this.toolName;
    },
    getActive: function()
    {
        return this.active;
    },
    setActive: function(active)
    {
        this.active = !!active;
    }
}

/**
 * Returns current status of tools
 *
 * @function
 * @returns  an array of Tools, an object with {toolName: string, enabled: boolean,
 *  enable:function(boolean, fnOfBoolean),}
 */
Browser.prototype.getTools = function()
{
    return [];
};

/*
 * Return the status of a tool
 * @param name, eg "console"
 * @returns an object with properties including toolName and enabled
 */
Browser.prototype.getTool = function(name)
{
    return this.tools[name];
}

/*
 * Call on the backend
 */
Browser.prototype.registerTool = function(tool)
{
    var name = tool.getName();
    if (name)
        this.tools[name] = tool;
}

/**
 * Returns the {@link BrowserContext} with the specified id or <code>null</code>
 * if none.
 *
 * @function
 * @param id identifier of an {@link BrowserContext}
 * @returns the {@link BrowserContext} with the specified id or <code>null</code>
 *
 */
Browser.prototype.getBrowserContext = function(id)
{
    var context = this.contexts[id];
    if (context)
        return context;
    return null;
};

/**
 * Returns the root contexts being browsed. A {@link BrowserContext} represents the
 * content that has been served up and is being rendered for a location (URL) that
 * has been navigated to.
 * <p>
 * This function does not require communication with the remote browser.
 * </p>
 * @function
 * @returns an array of {@link BrowserContext}'s
 */
Browser.prototype.getBrowserContexts = function()
{
    var knownContexts = [];
    for (var id in this.contexts)
        knownContexts.push(this.contexts[id]);
    return knownContexts;
};

Browser.prototype.eachContext = function(fnOfContext)
{
    return Firebug.TabWatcher.iterateContexts(fnOfContext);
};

/**
 * Returns the {@link BrowserContext} that currently has focus in the browser
 * or <code>null</code> if none.
 *
 * @function
 * @returns the {@link BrowserContext} that has focus or <code>null</code>
 */
Browser.prototype.getFocusBrowserContext = function()
{
    return this.activeContext;
};

/**
 * Returns whether this proxy is currently connected to the underlying browser it
 * represents.
 *
 *  @function
 *  @returns whether connected to the underlying browser
 */
Browser.prototype.isConnected = function()
{
    return this.connected;
};

/**
 * Registers a listener (function) for a specific type of event. Listener
 * call back functions are specified in {@link BrowserEventListener}.
 * <p>
 * The supported event types are:
 * <ul>
 *   <li>onBreak</li>
 *   <li>onConsoleDebug</li>
 *   <li>onConsoleError</li>
 *   <li>onConsoleInfo</li>
 *   <li>onConsoleLog</li>
 *   <li>onConsoleWarn</li>
 *   <li>onContextCreated</li>
 *   <li>onContextChanged</li>
 *   <li>onContextDestroyed</li>
 *   <li>onDisconnect</li>
 *   <li>onInspectNode</li>
 *   <li>onResume</li>
 *   <li>onScript</li>
 *   <li>onToggleBreakpoint</li>
 * </ul>
 * <ul>
 * <li>TODO: how can clients remove (deregister) listeners?</li>
 * </ul>
 * </p>
 * @function
 * @param eventType an event type ({@link String}) listed above
 * @param listener a listener (function) that handles the event as specified
 *   by {@link BrowserEventListener}
 * @exception Error if an unsupported event type is specified
 */
Browser.prototype.addListener = function(listener)
{
    var list = this.listeners;
    var i = list.indexOf(listener);
    if (i === -1)
        list.push(listener);
    // else no op
};

Browser.prototype.removeListener = function(listener)
{
    var list = this.listeners;
    var i = list.indexOf(listener);
    if (i !== -1)
        list.splice(i, 1);
    // else no-op
};


/*
 * Among listeners, return the first truthy value of eventName(args) or false
 */
Browser.prototype.dispatch = function(eventName, args)
{
    return FBL.dispatch2(this.listeners, eventName, args);
}

/**
 * Disconnects this client from the browser it is associated with.
 *
 * @function
 */
Browser.prototype.disconnect = function()
{
};

//TODO: support to remove a listener

// ************************************************************************************************
// Private, subclasses may call these functions

/**
 * Notification the given context has been added to this browser.
 * Adds the context to the list of active contexts and notifies context
 * listeners.
 * <p>
 * Has no effect if the context has already been created. For example,
 * it's possible for a race condition to occur when a remote browser
 * sends notification of a context being created before the initial set
 * of contexts have been retrieved. In such a case, it would possible for
 * a client to add the context twice (once for the create event, and again
 * when retrieving the initial list of contexts).
 * </p>
 * @function
 * @param context the {@link BrowserContext} that has been added
 */
Browser.prototype._contextCreated = function(context)
{
    // if already present, don't add it again
    var id = context.getId();
    if (this.contexts[id])
        return;

    this.contexts[id] = context;
    this._dispatch("onContextCreated", [context]);
};

/**
 * Notification the given context has been destroyed.
 * Removes the context from the list of active contexts and notifies context
 * listeners.
 * <p>
 * Has no effect if the context has already been destroyed or has not yet
 * been retrieved from the browser. For example, it's possible for a race
 * condition to occur when a remote browser sends notification of a context
 * being destroyed before the initial list of contexts is retrieved from the
 * browser. In this case an implementation could ask to destroy a context that
 * that has not yet been reported as created.
 * </p>
 *
 * @function
 * @param id the identifier of the {@link BrowserContext} that has been destroyed
 */
Browser.prototype._contextDestroyed = function(id)
{
    var destroyed = this.contexts[id];
    if (destroyed)
    {
        destroyed._destroyed();
        delete this.contexts[id];
        this._dispatch("onContextDestroyed", [destroyed]);
    }
};

/**
 * Notification the given context has been loaded. Notifies context listeners.
 *
 * @function
 * @param id the identifier of the {@link BrowserContext} that has been loaded
 */
Browser.prototype._contextLoaded = function(id)
{
    var loaded = this.contexts[id];
    if (loaded)
    {
        loaded._loaded();
        this._dispatch("onContextLoaded", [loaded]);
    }
};

/**
 * Dispatches an event notification to all registered functions for
 * the specified event type.
 *
 * @param eventType event type
 * @param arguments arguments to be applied to handler functions
 */
Browser.prototype._dispatch = function(eventType, args)
{
    var functions = this.handlers[eventType];
    if (functions)
    {
        for ( var i = 0; i < functions.length; i++)
            functions[i].apply(null, args);
    }
};

/**
 * Sets the browser context that has focus, possibly <code>null</code>.
 *
 * @function
 * @param context a {@link BrowserContext} or <code>null</code>
 */
Browser.prototype._setFocusContext = function(context)
{
    var prev = this.activeContext;
    this.activeContext = context;
    if (prev !== context)
        this._dispatch("onContextChanged", [prev, this.activeContext]);
};

/**
 * Sets whether this proxy is connected to its underlying browser.
 * Sends 'onDisconnect' notification when the browser becomes disconnected.
 *
 * @function
 * @param connected whether this proxy is connected to its underlying browser
 */
Browser.prototype._setConnected = function(connected)
{
    var wasConnected = this.connected;
    this.connected = connected;
    if (wasConnected && !connected)
        this._dispatch("onDisconnect", [this]);
};

// ************************************************************************************************
// Event Listener

/**
 * Describes the event listener functions supported by a {@link Browser}.
 *
 * @constructor
 * @type BrowserEventListener
 * @return a new {@link BrowserEventListener}
 * @version 1.0
 */
Browser.EventListener = {

    /**
     * Notification that execution has suspended in the specified
     * compilation unit.
     *
     * @function
     * @param compilationUnit the {@link CompilationUnit} execution has suspended in
     * @param lineNumber the line number execution has suspended at
     */
    onBreak: function(compilationUnit, lineNumber) {},

    /**
     * TODO:
     */
    onConsoleDebug: function() {},

    /**
     * TODO:
     */
    onConsoleError: function() {},

    /**
     * Notification the specified information messages have been logged.
     *
     * @function
     * @param browserContext the {@link BrowserContext} the messages were logged from
     * @param messages array of messages as {@link String}'s
     */
    onConsoleInfo: function(browserContext, messages) {},

    /**
     * Notification the specified messages have been logged.
     *
     * @function
     * @param browserContext the {@link BrowserContext} the messages were logged from
     * @param messages array of messages as {@link String}'s
     */
    onConsoleLog: function(browserContext, messages) {},

    /**
     * Notification the specified warning messages have been logged.
     *
     * @function
     * @param browserContext the {@link BrowserContext} the messages were logged from
     * @param messages array of messages as {@link String}'s
     */
    onConsoleWarn: function(browserContext, messages) {},

    /**
     * Notification the specified browser context has been created. This notification
     * is sent when a new context is created and before any scripts are compiled in
     * the new context.
     *
     * @function
     * @param browserContext the {@link BrowserContext} that was created
     */
    onContextCreated: function(browserContext) {},

    /**
     * Notification the focus browser context has been changed.
     *
     * @function
     * @param fromContext the previous {@link BrowserContext} that had focus or <code>null</code>
     * @param toContext the {@link BrowserContext} that now has focus or <code>null</code>
     */
    onContextChanged: function(fromContext, toContext) {},

    /**
     * Notification the specified browser context has been destroyed.
     *
     * @function
     * @param browserContext the {@link BrowserContext} that was destroyed
     */
    onContextDestroyed: function(browserContext) {},

    /**
     * Notification the specified browser context has completed loading.
     *
     * @function
     * @param browserContext the {@link BrowserContext} that has completed loading
     */
    onContextLoaded: function(browserContext) {},

    /**
     * Notification the connection to the remote browser has been closed.
     *
     * @function
     * @param browser the {@link Browser} that has been disconnected
     */
    onDisconnect: function(browser) {},

    /**
     * TODO:
     */
    onInspectNode: function() {},

    /**
     * Notification the specified execution context has resumed execution.
     *
     * @function
     * @param stack the {@link JavaScriptStack} that has resumed
     */
    onResume: function(stack) {},

    /**
     * Notification the specified compilation unit has been compiled (loaded)
     * in its browser context.
     *
     * @function
     * @param compilationUnit the {@link CompilationUnit} that has been compiled
     */
    onScript: function(compilationUnit) {},

    /**
     * Notification the specified breakpoint has been installed or cleared.
     * State can be retrieved from the breakpoint to determine whether the
     * breakpoint is installed or cleared.
     *
     * @function
     * @param breakpoint the {@link Breakpoint} that has been toggled
     */
    onToggleBreakpoint: function(breakpoint) {},

    /**
     * Notification the specified breakpoint has failed to install or clear.
     * State can be retrieved from the breakpoint to determine what failed.
     *
     * @function
     * @param breakpoint the {@link Breakpoint} that failed to install or clear
     */
    onBreakpointError: function(breakpoint) {}
};

// ********************************************************************************************* //
// CommonJS

return exports = Browser;

// ********************************************************************************************* //
});
