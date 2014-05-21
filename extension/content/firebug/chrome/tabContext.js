/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/css",
    "firebug/lib/options",
    "firebug/lib/wrapper",
    "firebug/lib/promise",
    "arch/compilationunit",
    "firebug/chrome/window",
    "firebug/chrome/plugin",
    "firebug/debugger/debuggerLib",
],
function(Firebug, FBTrace, Obj, Arr, Events, Url, Css, Options, Wrapper, Promise,
    CompilationUnit, Win, Plugin, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var throttleTimeWindow = 200;
var throttleMessageLimit = 30;
var throttleInterval = 30;
var throttleFlushCount = 20;
var refreshDelay = 300;

// Tracing support
var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_TABCONTEXT");

// ********************************************************************************************* //
// TabContext Implementation

function TabContext(win, browser, chrome, persistedState)
{
    this.window = win;
    this.browser = browser;
    this.persistedState = persistedState;

    this.name = Url.normalizeURL(this.getWindowLocation().toString());

    this.windows = [];
    this.panelMap = {};
    this.toolMap = {};
    this.sidePanelNames = {};

    this.compilationUnits = {};

    // New nsITraceableChannel interface (introduced in FF3.0.4) makes possible
    // to re-implement source-cache so that it solves the double-load problem.
    // Anyway, keep the previous cache implementation for backward compatibility
    // (with Firefox 3.0.3 and lower)
    if (Components.interfaces.nsITraceableChannel)
        this.sourceCache = new Firebug.TabCache(this);
    else
        this.sourceCache = new Firebug.SourceCache(this);

    // xxxHonza: remove?
    // Used by chromebug.
    this.global = win;

    // Initialize context.baseWindow here (modified then by the cd() command).
    this.baseWindow = win;

    // Private member. Should be never used directly.
    this.sourceFileMap = {};
}

/**
 * @object The object is responsible for storing data related to the current page.
 * You can also see this object as a 'Document' where the 'View' is represented by
 * the {@Panel} object. The life cycle of this object is tied to the associated page.
 *
 * This objects acts also as a 'Factory' and its directly responsible for creating
 * instances of registered {@Panel} objects. A panel (a view) is always associated
 * with a context (a document).
 *
 * The context is also responsible for maintaining asynchronous tasks (at least those
 * that are related to the current page). Any such task (a timeout, an interval, message
 * throttling or a promise) should be created through the context, so any ongoing
 * asynchronous task can be automatically stopped when the context is destroyed.
 */
TabContext.prototype =
/** @lends TabContext */
{
    getId: function()
    {
        // UID is set by {@TabWatcher} in TabWatcher.createContext() method.
        return this.uid;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tools (proxies)

    getTool: function(name)
    {
        var tool = this.toolMap[name];
        if (tool)
            return tool;

        var toolType = Firebug.getToolType(name);
        if (!toolType)
            return null;

        // Create an instance of required tool. There is one instance per context.
        tool = new toolType(this);
        this.toolMap[name] = tool;

        Trace.sysout("tabContext.getTool; Created: " + name);

        return tool;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    getConnection: function()
    {
        return Firebug.proxy.connection;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getWindowLocation: function()
    {
        return Win.safeGetWindowLocation(this.window);
    },

    getTitle: function()
    {
        if (this.window && this.window.document)
            return this.window.document.title;
        else
            return "";
    },

    getName: function()
    {
        if (!this.name || this.name === "about:blank")
        {
            var url = this.getWindowLocation().toString();
            if (Url.isDataURL(url))
            {
                var props = Url.splitDataURL(url);
                if (props.fileName)
                    this.name = "data url from "+props.fileName;
            }
            else
            {
                this.name = Url.normalizeURL(url);
                if (this.name === "about:blank" && this.window.frameElement)
                    this.name += " in "+Css.getElementCSSSelector(this.window.frameElement);
            }
        }
        return this.name;
    },

    getGlobalScope: function()
    {
        return this.window;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Source Files

    addSourceFile: function(sourceFile)
    {
        this.sourceFileMap[sourceFile.href] = sourceFile;
        sourceFile.context = this;

        var kind = CompilationUnit.SCRIPT_TAG;
        if (sourceFile.compilation_unit_type == "event")
            kind = CompilationUnit.BROWSER_GENERATED;

        if (sourceFile.compilation_unit_type == "eval")
            kind = CompilationUnit.EVAL;

        var url = sourceFile.href;

        Trace.sysout("tabContext.addSourceFile; " + url, [this, url, kind]);

        var compilationUnit = new CompilationUnit(url, this);
        compilationUnit.kind = kind;
        this.compilationUnits[url] = compilationUnit;

        //Firebug.connection.dispatch("onCompilationUnit", [this, url, kind]);

        // HACKs
        var compilationUnit = this.getCompilationUnit(url);
        if (!compilationUnit)
        {
            TraceError.sysout("tabContext.addSourceFile; ERROR Unknown URL: " + url,
                this.compilationUnits);
            return;
        }

        compilationUnit.sourceFile = sourceFile;
    },

    removeSourceFile: function(sourceFile)
    {
        Trace.sysout("tabContext.removeSourceFile; " + sourceFile.href + " in context " +
            sourceFile.context.getName());

        delete this.sourceFileMap[sourceFile.href];
        delete sourceFile.context;

        // ?? Firebug.onSourceFileDestroyed(this, sourceFile);
    },

    getSourceFile: function(href)
    {
        // SourceFile should not use URL fragment (issue 7251)
        // href = Url.normalizeURL(href);
        return this.sourceFileMap[href];
    },

    clearSources: function()
    {
        this.sourceFileMap = {};
        this.compilationUnits = {};
    },

    enumerateSourceFiles: function(callback)
    {
        for (var url in this.sourceFileMap)
        {
            var sourceFile = this.sourceFileMap[url];
            var result = callback(sourceFile);
            if (result)
                return result;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Browser Tools Interface BrowserContext

    getCompilationUnit: function(url)
    {
        // SourceFile should not use URL fragment (issue 7251)
        //url = Url.normalizeURL(url);
        return this.compilationUnits[url];
    },

    getAllCompilationUnits: function()
    {
        return Arr.values(this.compilationUnits);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Backward compatibility with extensions
     * xxxHonza: we might want to remove this at some point.
     */
    get chrome()
    {
        return Firebug.chrome;
    },

    /**
     * Returns the current global scope. It's usually the current window or an embedded
     * iframe. In case where the debugger is currently paused it can be the global of the
     * current execution context, but 'stoppedGlobal' is not used at the moment.
     *
     * The return object should be wrapped by default. We might want to append
     * an argument 'unwrap' that auto-unwraps the return value in the future, but
     * it should be discussed since unwrapping is an action that should be rather rare.
     */
    getCurrentGlobal: function()
    {
        return this.stoppedGlobal || this.baseWindow || this.window;
    },

    destroy: function(state)
    {
        state.panelState = {};

        // Inherit panelStates that have not been restored yet
        if (this.persistedState)
        {
            for (var panelName in this.persistedState.panelState)
                state.panelState[panelName] = this.persistedState.panelState[panelName];
        }

        // Destroy all panels in this context.
        for (var panelName in this.panelMap)
        {
            var panelType = Firebug.getPanelType(panelName);
            this.destroyPanel(panelType, state);
        }

        // All existing timeouts need to be cleared. This is why it's recommended
        // to always create timeouts through the context object. It ensures that
        // all timeouts and intervals are cleared when the context is destroyed.
        if (this.timeouts)
        {
            for (var timeout of this.timeouts)
                clearTimeout(timeout);
        }

        this.throttleTimeout = 0;

        // Also all waiting intervals must be cleared.
        if (this.intervals)
        {
            for (var timeout of this.intervals)
                clearInterval(timeout);
        }

        // All deferred objects must be rejected. Again using promises through
        // the context object is safe.
        if (this.deferreds)
        {
            for (var deferred of this.deferreds)
                deferred.reject("context destroyed");
        }

        // All debuggers created for this context must be destroyed (this really ought to be done
        // by the code that created them, but we leak memory and worsen performance permanently
        // if they forget, so we do this as a safety measure).
        if (this.debuggers && this.debuggers.length > 0)
        {
            for (var dbg of this.debuggers.slice())
            {
                TraceError.sysout("tabContext.destroy; failed to destroy debugger", dbg);
                DebuggerLib.destroyDebuggerForContext(this, dbg);
            }
        }

        // All existing DOM listeners need to be cleared. Note that context is destroyed
        // when the top level window is unloaded. However, some listeners can be registered
        // to iframes (documents), which can be already unloaded at this point.
        // Removing listeners from such 'unloaded' documents (or window) can throw
        // "TypeError: can't access dead object"
        // We should avoid these exceptions (even if they are not representing memory leaks)
        this.unregisterAllListeners();

        Trace.sysout("tabContext.destroy; " + this.getName() + " set state ", state);
    },

    getPanelType: function(panelName)
    {
        // Get "global" panelType, registered using Firebug.registerPanel
        var panelType = Firebug.getPanelType(panelName);

        // The panelType can be "local", available only within the context.
        if (!panelType && this.panelTypeMap && this.panelTypeMap.hasOwnProperty(panelName))
            panelType = this.panelTypeMap[panelName];

        if (panelType && !panelType.prototype)
        {
            TraceError.sysout("tabContext.getPanelType; ERROR no prototype " +
                panelType, panelType);
            return null;
        }

        return panelType || null;
    },

    getPanel: function(panelName, noCreate)
    {
        var panelType = this.getPanelType(panelName);
        if (!panelType)
            return null;

        // Create instance of the panelType only if it's enabled.
        var enabled = panelType.prototype.isEnabled ? panelType.prototype.isEnabled() : true;
        if (enabled)
            return this.getPanelByType(panelType, noCreate);

        return null;
    },

    isPanelEnabled: function(panelName)
    {
        var panelType = this.getPanelType(panelName);
        if (!panelType)
            return false;

        return (!panelType.prototype.isEnabled || panelType.prototype.isEnabled());
    },

    getPanelByType: function(panelType, noCreate)
    {
        if (!panelType || !this.panelMap)
            return null;

        var panelName = panelType.prototype.name;
        if ( this.panelMap.hasOwnProperty(panelName) )
            return this.panelMap[panelName];
        else if (!noCreate)
            return this.createPanel(panelType);
    },

    eachPanelInContext: function(callback)
    {
        for (var panelName in this.panelMap)
        {
            if (this.panelMap.hasOwnProperty(panelName))
            {
                var panel = this.panelMap[panelName];
                var rc = callback(panel);
                if (rc)
                    return rc;
            }
        }
    },

    createPanel: function(panelType)
    {
        // Instantiate a panel object. This is why panels are defined by prototype inheritance
        var panel = new panelType();
        this.panelMap[panel.name] = panel;

        Trace.sysout("tabContext.createPanel; Panel created: " + panel.name, panel);

        Events.dispatch(Firebug.modules, "onCreatePanel", [this, panel, panelType]);

        // Initialize panel and associate with a document.
        if (panel.parentPanel)
        {
            // then this new panel is a side panel
            panel.mainPanel = this.panelMap[panel.parentPanel];
            if (panel.mainPanel)
            {
                // then our panel map is consistent
                // wire the side panel to get UI events from the main panel
                panel.mainPanel.addListener(panel);
            }
            else
            {
                // then our panel map is broken, maybe by an extension failure.
                TraceError.sysout("tabContext.createPanel; panel.mainPanel missing " +
                    panel.name + " from " + panel.parentPanel.name);
            }
        }

        var doc = this.chrome.getPanelDocument(panelType);
        panel.initialize(this, doc);

        return panel;
    },

    destroyPanel: function(panelType, state)
    {
        var panelName = panelType.prototype.name;
        var panel = this.panelMap[panelName];
        if (!panel)
            return;

        // Create an object to persist state, re-using old one if it was never restored
        var panelState = panelName in state.panelState ? state.panelState[panelName] : {};
        state.panelState[panelName] = panelState;

        try
        {
            // Destroy the panel and allow it to persist extra info to the state object
            var dontRemove = panel.destroy(panelState);
            delete this.panelMap[panelName];

            if (dontRemove)
                return;
        }
        catch (exc)
        {
            TraceError.sysout("tabContext.destroy FAILS (" + panelName + ") " + exc, exc);

            // the destroy failed, don't keep the bad state
            delete state.panelState[panelName];
        }

        // Remove the panel node from the DOM and so delete its content.
        var panelNode = panel.panelNode;
        if (panelNode && panelNode.parentNode)
            panelNode.parentNode.removeChild(panelNode);
    },

    removePanel: function(panelType, state)
    {
        var panelName = panelType.prototype.name;
        if (!this.panelMap.hasOwnProperty(panelName))
            return null;

        state.panelState = {};

        this.destroyPanel(panelType, state);
    },

    // allows a panel from one context to be used in other contexts.
    setPanel: function(panelName, panel)
    {
        if (panel)
            this.panelMap[panelName] = panel;
        else
            delete this.panelMap[panelName];
    },

    invalidatePanels: function()
    {
        if (!this.invalidPanels)
            this.invalidPanels = {};

        // xxxHonza: this is generating too many traces.
        //if (Trace.active)
        //{
        //    Trace.sysout("tabContext.invalidatePanels; " +
        //        Arr.cloneArray(arguments).toString());
        //}

        for (var i = 0; i < arguments.length; ++i)
        {
            var panelName = arguments[i];
            var panel = this.getPanel(panelName, true);
            if (panel && !panel.noRefresh)
                this.invalidPanels[panelName] = 1;
        }

        if (this.refreshTimeout)
        {
            this.clearTimeout(this.refreshTimeout);
            delete this.refreshTimeout;
        }

        this.refreshTimeout = this.setTimeout(() =>
        {
            var invalids = [];

            for (var panelName in this.invalidPanels)
            {
                var panel = this.getPanel(panelName, true);
                if (panel)
                {
                    if (panel.visible && !panel.editing)
                        panel.refresh();
                    else
                        panel.needsRefresh = true;

                    // If the panel is being edited, we'll keep trying to
                    // refresh it until editing is done
                    if (panel.editing)
                        invalids.push(panelName);
                }
            }

            delete this.invalidPanels;
            delete this.refreshTimeout;

            // Keep looping until every tab is valid
            if (invalids.length)
                this.invalidatePanels.apply(this, invalids);

        }, refreshDelay);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Timeouts

    /**
     * Most of the timeouts in Firebug should be spawned through this method. {@link TabContext}
     * object keeps track of all awaiting timeouts and makes sure to clear them if the
     * current context is destroyed (e.g. the page is refreshed or Firebug deactivated for it).
     */
    setTimeout: function(fn, delay)
    {
        if (setTimeout == this.setTimeout)
            throw new Error("setTimeout recursion");

        // We're using a sandboxed setTimeout function.
        var timeout = setTimeout(() =>
        {
            this.timeouts.delete(timeout);

            try
            {
                fn();
            }
            catch (err)
            {
                TraceError.sysout("tabContext.setTimeout; EXCEPTION " + err, err);
            }
        }, delay);

        if (!this.timeouts)
            this.timeouts = new Set();

        this.timeouts.add(timeout);

        return timeout;
    },

    clearTimeout: function(timeout)
    {
        // We're using a sandboxed clearTimeout function.
        clearTimeout(timeout);

        if (this.timeouts)
            this.timeouts.delete(timeout);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Intervals

    /**
     * Calls a function repeatedly, with a fixed time delay between each call to that function.
     * The caller should always stop created interval using {@TabContext.clearInterval}.
     */
    setInterval: function(fn, delay)
    {
        // We're using a sandboxed setInterval function.
        var timeout = setInterval(() =>
        {
            this.intervals.delete(timeout);

            try
            {
                fn();
            }
            catch (err)
            {
                TraceError.sysout("tabContext.setInterval; EXCEPTION " + err, err);
            }
        }, delay);

        if (!this.intervals)
            this.intervals = new Set();

        this.intervals.add(timeout);

        return timeout;
    },

    clearInterval: function(timeout)
    {
        // We're using a sandboxed clearInterval function.
        clearInterval(timeout);

        if (this.intervals)
            this.intervals.delete(timeout);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Promises

    defer: function()
    {
        if (!this.deferreds)
            this.deferreds = new Set();

        var deferred = Promise.defer();
        this.deferreds.add(deferred);
        return deferred;
    },

    rejectDeferred: function(deferred, reason)
    {
        deferred.reject(reason);

        if (this.deferreds)
            this.deferreds.delete(deferred);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Throttling

    delay: function(message, object)
    {
        this.throttle(message, object, null, true);
    },

    // queue the call |object.message(arg)| or just delay it if forceDelay
    throttle: function(message, object, args, forceDelay)
    {
        if (!this.throttleInit)
        {
            this.throttleBuildup = 0;
            this.throttleQueue = [];
            this.throttleTimeout = 0;
            this.lastMessageTime = 0;
            this.throttleInit = true;
        }

        if (!forceDelay)
        {
            if (!Options.get("throttleMessages"))
            {
                message.apply(object, args);
                return false;
            }

            // Count how many messages have been logged during the throttle period
            var logTime = Date.now();
            if (logTime - this.lastMessageTime < throttleTimeWindow)
                ++this.throttleBuildup;
            else
                this.throttleBuildup = 0;

            this.lastMessageTime = logTime;

            // If the throttle limit has been passed, enqueue the message to be
            // logged later on a timer, otherwise just execute it now
            if (!this.throttleQueue.length && this.throttleBuildup <= throttleMessageLimit)
            {
                try
                {
                    message.apply(object, args);
                }
                catch (e)
                {
                    TraceError.sysout("tabContext.throttle; EXCEPTION " + e, e);
                }

                return false;
            }
        }

        this.throttleQueue.push(message, object, args);

        if (!this.throttleTimeout)
        {
            this.throttleTimeout =
                this.setTimeout(this.flushThrottleQueue.bind(this), throttleInterval);
        }

        return true;
    },

    flushThrottleQueue: function()
    {
        var queue = this.throttleQueue;

        if (!queue[0])
            Trace.sysout("tabContext.flushThrottleQueue; no queue[0]", queue);

        var max = throttleFlushCount * 3;
        if (max > queue.length)
            max = queue.length;

        for (var i = 0; i < max; i += 3)
        {
            try
            {
                queue[i].apply(queue[i+1], queue[i+2]);
            }
            catch (e)
            {
                TraceError.sysout("tabContext.flushThrottleQueue; EXCEPTION " + e, e);
            }
        }

        queue.splice(0, throttleFlushCount*3);

        if (queue.length)
        {
            var self = this;
            this.throttleTimeout =
                this.setTimeout(function f() { self.flushThrottleQueue(); }, throttleInterval);
        }
        else
        {
            this.throttleTimeout = 0;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Listeners

    addEventListener: function(parent, eventId, listener, capturing)
    {
        if (!this.listeners)
            this.listeners = [];

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.parent == parent && l.eventId == eventId && l.listener == listener &&
                l.capturing == capturing)
            {
                // Listener already registered!
                return;
            }
        }

        parent.addEventListener(eventId, listener, capturing);

        this.listeners.push({
            parent: parent,
            eventId: eventId,
            listener: listener,
            capturing: capturing,
        });
    },

    removeEventListener: function(parent, eventId, listener, capturing)
    {
        parent.removeEventListener(eventId, listener, capturing);

        if (!this.listeners)
            this.listeners = [];

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.parent == parent && l.eventId == eventId && l.listener == listener &&
                l.capturing == capturing)
            {
                this.listeners.splice(i, 1);
                break;
            }
        }
    },

    /**
     * Executed by the framework when the context is about to be destroyed.
     */
    unregisterAllListeners: function()
    {
        if (!this.listeners)
            return;

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];

            try
            {
                l.parent.removeEventListener(l.eventId, l.listener, l.capturing);
            }
            catch (e)
            {
                TraceError.sysout("tabContext.unregisterAllListeners; (" +
                    l.eventId + ") " + e, e);
            }
        }

        this.listeners = null;
    }
};

// ********************************************************************************************* //
// Registration

// xxxHonza: backward compatibility
Firebug.TabContext = TabContext;

return TabContext;

// ********************************************************************************************* //
});
