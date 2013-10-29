/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/lib",
    "firebug/lib/events",
    "firebug/chrome/firefox",
    "firebug/chrome/window",
    "arch/webApp",
    "firebug/lib/options",
    "firebug/chrome/tabWatcher",
],
function factoryBrowser(FBL, Events, Firefox, Win, WebApp, Options, TabWatcher) {

// ********************************************************************************************* //
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
    //this.contexts = []; // metadata instances
    this.activeContext = null;
    this.listeners = [];  // array of Browser.listener objects
    this.tools = {};  // registry of known tools
    this.connected = false;
}

// ********************************************************************************************* //
// API

Browser.debug = {handlers: true};
Browser.onDebug = function()
{
    if (Browser.debug)
        throw new Error("Browser.debug set but no Brower.onDebug is defined");
};

Browser.unimplementedHandler = function()
{
    if (Browser.debug && Browser.debug.handlers)
        Browser.onDebug("Browser.listener unimplemented event handler called ",
            {handler: this, args: arguments});
};

Browser.listener =
{
    onBreak: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onConsoleDebug: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onConsoleError: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onConsoleInfo: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onConsoleLog: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onConsoleWarn: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onContextCreated: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onContextDestroyed: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onContextChanged: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onContextLoaded: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onInspectNode: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onResume: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onScript: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onSuspend: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onToggleBreakpoint: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onBreakpointError: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    },

    onDisconnect: function()
    {
        Browser.unimplementedHandler.apply(this, arguments);
    }
};

/**
 * Testing and sanity: clearAllBreakpoints
 */
Browser.prototype.clearAllBreakpoints = function()
{
    Firebug.Debugger.clearAllBreakpoints();
};

/**
 * Command: clearAnnotations
 */
Browser.prototype.clearAnnotations = function()
{
    // should trigger event onClearAnnotations
    Firebug.Activation.clearAnnotations();
};

Browser.prototype.getWebAppByWindow = function(win)
{
    if (win && win.top)
        return new WebApp(win.top);
};

Browser.prototype.getContextByWebApp = function(webApp)
{
    var topMost = webApp.getTopMostWindow();
    var context = TabWatcher.getContextByWindow(topMost);
    return context;

    /*for (var i = 0; i < this.contexts.length; i++)
    {
        var context = this.contexts[i];
        if (context.window === topMost)
            return context
    }*/
};

Browser.prototype.getContextByWindow = function(win)
{
    var webApp = this.getWebAppByWindow(win);
    if (webApp)
        return this.getContextByWebApp(webApp);
};

/**
 * get local metadata for the remote WebApp if it exists
 * @return ToolInterface.WebAppContext or null if the webApp is not being debugged
 */
Browser.prototype.setContextByWebApp = function(webApp, context)
{
    var topMost = webApp.getTopMostWindow();
    if (context.window !== topMost)
    {
        FBTrace.sysout("Browser setContextByWebApp mismatched context ",
            {context: context, win: topMost});
    }

    // xxxHonza: possible mem leak, the context object isn't removed from the array sometimes
    // Do not use for now (this will be used for remoting).
    //this.contexts.push(context);
};

/**
 * Stop debugging a WebApp and cause the destruction of a ToolsInterface.WebAppContext
 * @param webAppContext metadata for the page that we are not going to debug any more
 * @param userCommands true if the user of this UI said to close (vs algorithm)
 */
Browser.prototype.closeContext = function(context, userCommands)
{
    if (context)
    {
        var topWindow = context.window;

        /*if (index === -1)
        {
            if (FBTrace.DBG_ERRORS)
            {
                var loc = Win.safeGetWindowLocation(topWindow);
                FBTrace.sysout("Browser.closeContext ERROR, no context matching " + loc);
            }
        }
        else
        {
            this.contexts.splice(index, 1);
        }*/

        // TEMP
        TabWatcher.unwatchWindow(topWindow);

        var browser = Win.getBrowserByWindow(topWindow);
        if (!browser)
            throw new Error("Browser.closeContext ERROR, no browser for top most window of context "+
                context.getName());

        delete browser.showFirebug;

        var result = false;
        var shouldDispatch = TabWatcher.unwatchTopWindow(browser.contentWindow);
        if (shouldDispatch)
        {
            // TODO remove
            Events.dispatch(TabWatcher.fbListeners, "unwatchBrowser", [browser, null]);
            result = true;
        }

        // Firebug is closing, clean up the persisted content. The persisted state should
        // not be used after re-activating Firebug (see also issue issue 6901, breakpoint
        // client objects need to be recreated).
        delete browser.persistedState;

        return result;
    }
};

/**
 * get local metadata for the remote WebApp or create one
 * @param webApp, ToolsInterface.WebApp representing top level window
 * @return ToolInterface.WebAppContext
 */
Browser.prototype.getOrCreateContextByWebApp = function(webApp)
{
    var context = this.getContextByWebApp(webApp);
    if (!context)
    {
        var topWindow = webApp.getTopMostWindow();
        var browser = Win.getBrowserByWindow(topWindow);
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("BTI.tabWatcher.watchBrowser for: " + (topWindow.location));

        // TEMP
        var context = TabWatcher.watchTopWindow(topWindow, browser.currentURI, true);
        this.setContextByWebApp(webApp, context);

        // TEMP; Watch also all iframes. Firebug has been initialized when the page is already
        // loaded and so, we can't rely on auto-registration done by FrameProgressListener.
        Win.iterateWindows(context.window, function (win)
        {
            TabWatcher.watchWindow(win, context, false);
        });

        browser.showFirebug = true;

        // TODO remove
        Events.dispatch(TabWatcher.fbListeners, "watchBrowser", [browser]);
    }
    return context;
};

/**
 * The WebApp on the selected tab of the selected window of this Browser
 * @return WebApp ( never null )
 */
Browser.prototype.getCurrentSelectedWebApp = function()
{
    // Remote version must seek selected XUL window first.
    var browser = Firefox.getCurrentBrowser();
    var webApp = new WebApp(browser.contentWindow);
    if (FBTrace.DBG_ACTIVATION)
        FBTrace.sysout("BTI.WebApp ", {browser: browser, webApp: webApp});
    return webApp;
};


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

/**
 * Return the status of a tool
 * @param name, eg "console"
 * @returns an object with properties including toolName and enabled
 */
Browser.prototype.getTool = function(name)
{
    // This pollutes the FBTrace console too much.
    //if (FBTrace.DBG_ERRORS && !this.tools[name])
    //    FBTrace.sysout("BTI.Browser.getTool; Unknown tool: " + name);

    return this.tools[name];
};

/**
 * Call on the backend
 */
Browser.prototype.registerTool = function(tool)
{
    var name = tool.getName();
    if (name)
    {
        if (FBTrace.DBG_ERRORS && this.tools[name])
            FBTrace.sysout("BTI.Browser.unregisterTool; Already registered tool: " + name);

        this.tools[name] = tool;
    }
};

Browser.prototype.unregisterTool = function(tool)
{
    var name = tool.getName();
    if (name)
    {
        if (FBTrace.DBG_ERRORS && !this.tools[name])
            FBTrace.sysout("BTI.Browser.unregisterTool; Unknown tool: " + name);
        else
            delete this.tools[name];
    }
};

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

    // If a listener is appended after connect, let's send fake onConnect
    // to ensure initialization.
    if (this.isConnected())
        Events.dispatch2([listener], "onConnect", [this]);

    if (FBTrace.DBG_BTI)
    {
        FBTrace.sysout("BTI.Browser.addListener; listener added: " +
            listener.dispatchName, listener);
    }
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

    // xxxHonza: should it be alwasy called or only if isConnected() == true?
    //if (this.isConnected())
        Events.dispatch2([listener], "onDisconnect", [this]);
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
};

/**
 * Disconnects this client from the browser it is associated with.
 *
 * @function
 */
Browser.prototype.disconnect = function()
{
    this.removeListener(Firebug);
    TabWatcher.destroy();

    // Remove the listener after the Firebug.TabWatcher.destroy() method is called, so
    // that the destroyContext event is properly dispatched to the Firebug object and
    // consequently to all registered modules.
    TabWatcher.removeListener(this);

    this._setConnected(false);
};

// ********************************************************************************************* //
// Private, subclasses may call these functions

/**
 * Command to resume/suspend backend
 */
Browser.prototype.toggleResume = function(resume)
{
    if (FBTrace.DBG_ACTIVATION)
        FBTrace.sysout("BTI.toggleResume" + (Firebug.getSuspended() ? "OFF" : "ON") +
            " -> " + (!!resume ? "ON" : "OFF"));

    // This should be the only method to call suspend() and resume().
    // either a new context or revisiting an old one
    if (resume)
    {
        if (Firebug.getSuspended())
        {
            // This will cause onResumeFirebug for every context including this one.
            Firebug.resume();
        }
    }
    // this browser has no context
    else
    {
        Firebug.suspend();
    }
},

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
        this.dispatch("onContextChanged", [prev, this.activeContext]);
};

// ********************************************************************************************* //
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

/**
 * @object
 */
var TabWatchListener =
/** @lends TabWatchListener */
{
    dispatchName: "TabWatchListener",

    // called after a context is created.
    initContext: function(context, persistedState)
    {
        context.panelName = context.browser.panelName;
        if (context.browser.sidePanelNames)
            context.sidePanelNames = context.browser.sidePanelNames;

        if (FBTrace.DBG_ERRORS && !context.sidePanelNames)
            FBTrace.sysout("BTI.firebug.initContext sidePanelNames:", context.sidePanelNames);

        Events.dispatch(Firebug.modules, "initContext", [context, persistedState]);

        // a newly created context becomes the default for the view
        Firebug.chrome.setFirebugContext(context);

        // a newly created context is active
        Firebug.connection.toggleResume(context);
    },

    // To be called from Firebug.TabWatcher only, see selectContext
    // null as context means we don't debug that browser
    showContext: function(browser, context)
    {
        // the context becomes the default for its view
        Firebug.chrome.setFirebugContext(context);

        // resume, after setting Firebug.currentContext
        // The condition is appended to solve issue 5916
        // 1) If a new tab is opened by clicking a link in an existing tab, HTTP request
        //    is started in the existing tab.
        // 2) New tab is always set to about:blank at the beginning and there is no
        //    context for it.
        // 3) Consequently the tab watcher calls 'showContext' with context == null
        //    and Firebug.connection.toggleResume suspends Firebug for all existing
        //    contexts including the one which started the new tab.
        // 4) The request displayed in the HTTP panel never finishes since even the
        //    Net panel stops listening and calls unmonitorContext, see
        //    {@Firebug.NetMonitor.onSuspendFirebug}
        //
        // So, do not resume/suspend for "about:blank" pages.
        if (browser.contentWindow.location.href != "about:blank")
            Firebug.connection.toggleResume(context);

        // tell modules we may show UI
        Events.dispatch(Firebug.modules, "showContext", [browser, context]);

        Firebug.showContext(browser, context);
    },

    // The context for this browser has been destroyed and removed.
    unwatchBrowser: function(browser)
    {
        Firebug.connection.toggleResume(false);
    },

    // Either a top level or a frame (interior window) for an existing context is seen by the TabWatcher.
    watchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.watchWindow(context, win);
        }

        Events.dispatch(Firebug.modules, "watchWindow", [context, win]);
    },

    unwatchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.unwatchWindow(context, win);
        }

        Events.dispatch(Firebug.modules, "unwatchWindow", [context, win]);
    },

    loadWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.loadWindow(context, win);
        }

        Events.dispatch(Firebug.modules, "loadWindow", [context, win]);
    },

    loadedContext: function(context)
    {
        if (!context.browser.currentURI)
            FBTrace.sysout("BTI.firebug.loadedContext problem browser ", context.browser);

        Events.dispatch(Firebug.modules, "loadedContext", [context]);
    },

    destroyContext: function(context, persistedState, browser)
    {
        // then we are called just to clean up
        if (!context)
            return;

        Events.dispatch(Firebug.modules, "destroyContext", [context, persistedState]);

        // xxxHonza: Not sure if this code is correct. Test case: Firebug active, reload
        // 1) The Firebug.currentContext can be already set to the new one
        // 2) The Firebug.currentContext can be already null.
        // Calling clearPanels() is important, because it also clears the statusPath, which
        // contains references to panel objects (e.g. the page document in case of the HTML panel)
        if (Firebug.currentContext == context || !Firebug.currentContext)
        {
            // disconnect the to-be-destroyed panels from the panelBar
            Firebug.chrome.clearPanels();
            // Firebug.currentContext is about to be destroyed
            Firebug.chrome.setFirebugContext(null);
        }

        var browser = context.browser;

        // Persist remnants of the context for restoration if the user reloads
        try
        {
            browser.panelName = context.panelName;
            browser.sidePanelNames = context.sidePanelNames;
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("browser.destroyContext; " + e, e);
        }

        // Next time the context is deleted and removed from the Firebug.TabWatcher,
        // we clean up in unWatchBrowser.
    },

    onSourceFileCreated: function()
    {
        Events.dispatch(Firebug.modules, "onSourceFileCreated", arguments);
    },

    shouldCreateContext: function()
    {
        if (Events.dispatch2(Firebug.modules, "shouldCreateContext", arguments))
            return true;
        else
            return false;
    },

    shouldNotCreateContext: function()
    {
        if (Events.dispatch2(Firebug.modules, "shouldNotCreateContext", arguments))
            return true;
        else
            return false;
    },

    shouldShowContext: function()
    {
        if (Events.dispatch2(Firebug.modules, "shouldShowContext", arguments))
            return true;
        else
            return false;
    }
};

// ********************************************************************************************* //

Browser.prototype.connect = function ()
{
    // Events fired on browser are re-broadcasted to Firebug.modules
    Firebug.connection.addListener(Firebug);

    // Listen for preference changes. This way the options module is not dependent on tools
    // xxxHonza: can this be in Browser interface?
    Options.addListener(
    {
        updateOption: function(name, value)
        {
            Firebug.connection.dispatch("updateOption", [name, value]);
        }
    });

    TabWatcher.initialize();
    TabWatcher.addListener(TabWatchListener);

    this._setConnected(true);
};

/**
 * Disconnects this client from the browser it is associated with.
 *
 * @function
 */
Browser.prototype.disconnect = function()
{
    this.removeListener(Firebug);
    TabWatcher.destroy();

    // Remove the listener after the Firebug.TabWatcher.destroy() method is called, so
    // that the destroyContext event is properly dispatched to the Firebug object and
    // consequently to all registered modules.
    TabWatcher.removeListener(this);

    this._setConnected(false);
}

/**
 * Sets whether this proxy is connected to its underlying browser.
 * Sends 'onDisconnect' notification when the browser becomes disconnected.
 *
 * @function
 * @param connected whether this proxy is connected to its underlying browser
 */
Browser.prototype._setConnected = function(connected)
{
    if (FBTrace.DBG_ACTIVATION)
        FBTrace.sysout("BTI.Browser._setConnected " + connected + " this.connected " +
            this.connected);

    var wasConnected = this.connected;
    this.connected = connected;

    if (wasConnected && !connected)
        this.dispatch("onDisconnect", [this]);
    else if (!wasConnected && connected)
        this.dispatch("onConnect", [this]);
};

// ********************************************************************************************* //

return exports = Browser;

// ********************************************************************************************* //
});
