/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

define([
    "firebug/lib",
    "firebug/lib/events",
    "firebug/firefox/firefox",
    "firebug/ToolsInterface",
    "firebug/firefox/window",
    "arch/webApp",
    "firebug/lib/options",
    "firebug/tabWatcher",  // TODO firebug/firefox/tabWatcher
],
function factoryBrowser(FBL, Events, Firefox, ToolsInterface, WIN, WebApp, Options, TabWatcher) {

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
    this.contexts = []; // metadata instances
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

/*
 * Command: clearAnnotations
 */
Browser.prototype.clearAnnotations = function()
{
    Firebug.Activation.clearAnnotations();  // should trigger event onClearAnnotations
}

Browser.prototype.getContextByWebApp = function(webApp)
{
    var topMost = webApp.getTopMostWindow();
    var context = TabWatcher.getContextByWindow(topMost);
    return context;

    for (var i = 0; i < this.contexts.length; i++)
    {
        var context = this.contexts[i];
        if (context.window === topMost)
            return context
    }
}

Browser.prototype.setContextByWebApp = function(webApp, context)
{
    var topMost = webApp.getTopMostWindow();
    if (context.window !== topMost)
        Debug.ERROR("Browser setContextByWebApp mismatched context ", {context: context, win: topMost});

    this.contexts.push( context );
}

//API
Browser.prototype.closeContext = function(context, userCommands)
{
    if (context)
    {
        var topWindow = context.window;
        var index = this.contexts.indexOf(topWindow);
        if (index === -1)
        {
            var loc = WIN.safeGetWindowLocation(topWindow);
            FBTrace.sysout("Browser.closeContext ERROR, no context matching "+loc);
        }
        else
        {
            this.contexts.splice(index, 1);
        }

        // TEMP
        TabWatcher.unwatchWindow(topWindow);

        var browser = WIN.getBrowserByWindow(topWindow);
        if (!browser)
            throw new Error("Browser.closeContext ERROR, no browser for top most window of context "+context.getName());

        delete browser.showFirebug;

        var shouldDispatch = TabWatcher.unwatchTopWindow(browser.contentWindow);

        if (shouldDispatch)
        {
            var userCommands;
            Events.dispatch(TabWatcher.fbListeners, "unwatchBrowser", [browser, userCommands]);  // TODO remove
            return true;
        }
        return false;
    }
}
// API
Browser.prototype.getOrCreateContextByWebApp = function(webApp)
{
    var context = this.getContextByWebApp(webApp);
    if (!context)
    {
        var topWindow = webApp.getTopMostWindow();
        var browser = WIN.getBrowserByWindow(topWindow);
        if (FBTrace.DBG_WINDOWS)
        {
            FBTrace.sysout("-> tabWatcher.watchBrowser for: " + (topWindow.location));
        }

        // TEMP
        var context = TabWatcher.watchTopWindow(topWindow, browser.currentURI, true);
        this.setContextByWebApp(webApp, context);

        browser.showFirebug = true;

        Events.dispatch(TabWatcher.fbListeners, "watchBrowser", [browser]);  // TODO remove
    }
    return context;
}

// API
Browser.prototype.getCurrentSelectedWebApp = function()
{
    // Remote version must seek selected XUL window first.
    var browser = Firefox.getCurrentBrowser();
    var webApp = new ToolsInterface.WebApp(browser.contentWindow);
    FBTrace.sysout("ToolsInterface.WebApp ", {browser: browser, webApp: webApp, ToolsInterface: ToolsInterface});
    return webApp;
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
    {
        if (this.tools[name])
            FBTrace.sysout("BTI.Browser.unregisterTool; Already registered tool: " + name);

        this.tools[name] = tool;
    }
}

Browser.prototype.unregisterTool = function(tool)
{
    var name = tool.getName();
    if (name)
    {
        if (!this.tools[name])
            FBTrace.sysout("BTI.Browser.unregisterTool; Unknown tool: " + name);

        delete this.tools[name];
    }
}

Browser.prototype.eachContext = function(fnOfContext)
{
    try
    {
        return Firebug.TabWatcher.iterateContexts(fnOfContext);
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("BTI.browser.eachContext; EXCEPTION " + e, e);
    }
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
    else
        FBTrace.sysout("BTI.Browser.addListener; ERROR The listener is already appended " +
            (listener.dispatchName ? listener.dispatchName : ""));
};

Browser.prototype.removeListener = function(listener)
{
    var list = this.listeners;
    var i = list.indexOf(listener);
    if (i !== -1)
        list.splice(i, 1);
    else
        FBTrace.sysout("BTI.Browser.removeListener; ERROR Unknown listener " +
            (listener.dispatchName ? listener.dispatchName : ""));
};

/**
 * Among listeners, return the first truthy value of eventName(args) or false
 */
Browser.prototype.dispatch = function(eventName, args)
{
    try
    {
        return Events.dispatch2(this.listeners, eventName, args);
    }
    catch (exc)
    {
        FBTrace.sysout("BTI.Browser.dispatch; EXCEPTION " + exc, exc);
    }
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



/*
 * Command to resume/suspend backend
 */
Browser.prototype.toggleResume = function(resume)
{
    // this should be the only method to call suspend and resume.
    if (resume)  // either a new context or revisiting an old one
    {
        if (Firebug.getSuspended())
            Firebug.resume();  // This will cause onResumeFirebug for every context including this one.
    }
    else // this browser has no context
    {
        Firebug.suspend();
    }
},


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

// *********************************************************************************************
//

var clearContextTimeout = 0;

var TabWatchListener =
{
    initContext: function(context, persistedState)  // called after a context is created.
    {
        context.panelName = context.browser.panelName;
        if (context.browser.sidePanelNames)
            context.sidePanelNames = context.browser.sidePanelNames;

        if (FBTrace.DBG_ERRORS && !context.sidePanelNames)
            FBTrace.sysout("firebug.initContext sidePanelNames:",context.sidePanelNames);

        Events.dispatch(Firebug.modules, "initContext", [context, persistedState]);

        Firebug.chrome.setFirebugContext(context); // a newly created context becomes the default for the view

        ToolsInterface.browser.toggleResume(context); // a newly created context is active
    },



    /*
     * To be called from Firebug.TabWatcher only, see selectContext
     */
    showContext: function(browser, context)  // Firebug.TabWatcher showContext. null context means we don't debug that browser
    {
        if (clearContextTimeout)
        {
            clearTimeout(clearContextTimeout);
            clearContextTimeout = 0;
        }

        Firebug.chrome.setFirebugContext(context); // the context becomes the default for its view
        ToolsInterface.browser.toggleResume(context);  // resume, after setting Firebug.currentContext

        Events.dispatch(Firebug.modules, "showContext", [browser, context]);  // tell modules we may show UI

        Firebug.showContext(browser, context);
    },

    unwatchBrowser: function(browser)  // the context for this browser has been destroyed and removed
    {
        ToolsInterface.browser.toggleResume(false);
    },

    // Either a top level or a frame, (interior window) for an exist context is seen by the tabWatcher.
    watchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.watchWindow(win);
        }

        Events.dispatch(Firebug.modules, "watchWindow", [context, win]);
    },

    unwatchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.unwatchWindow(win);
        }
        Events.dispatch(Firebug.modules, "unwatchWindow", [context, win]);
    },

    loadedContext: function(context)
    {
        if (!context.browser.currentURI)
            FBTrace.sysout("firebug.loadedContext problem browser ", context.browser);

        Events.dispatch(Firebug.modules, "loadedContext", [context]);
    },

    destroyContext: function(context, persistedState, browser)
    {
        if (!context)  // then we are called just to clean up
            return;

        Events.dispatch(Firebug.modules, "destroyContext", [context, persistedState]);

        if (Firebug.currentContext == context)
        {
            Firebug.chrome.clearPanels(); // disconnect the to-be-destroyed panels from the panelBar
            Firebug.chrome.setFirebugContext(null);  // Firebug.currentContext is about to be destroyed
        }

        var browser = context.browser;
        // Persist remnants of the context for restoration if the user reloads
        browser.panelName = context.panelName;
        browser.sidePanelNames = context.sidePanelNames;

        // next the context is deleted and removed from the Firebug.TabWatcher, we clean up in unWatchBrowser
    },

    onSourceFileCreated: function(context, sourceFile)
    {
        Events.dispatch(Firebug.modules, "onSourceFileCreated", [context, sourceFile]);
    },

};

ToolsInterface.toolTypes.register(Browser);

Browser.initialize = function ()
{
    // Events fired on browser are re-broadcast to Firebug.modules
    ToolsInterface.browser.addListener(Firebug);

    //Listen for preference changes. This way options module is not dependent on tools
    //xxxHonza: can this be in Browser interface?
    Options.addListener(
    {
        updateOption: function(name, value)
        {
            ToolsInterface.browser.dispatch("updateOption", [name, value]);
        }
    });
    TabWatcher.initialize();
    TabWatcher.addListener(TabWatchListener);
}


return exports = Browser;

// *********************************************************************************************
});
