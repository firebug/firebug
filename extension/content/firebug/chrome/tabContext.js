/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "arch/compilationunit",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/chrome/window",
    "firebug/lib/css",
    "firebug/chrome/plugin",
],
function(Obj, CompilationUnit, Events, Url, Win, Css) {

// ********************************************************************************************* //
// Constants

const throttleTimeWindow = 200;
const throttleMessageLimit = 30;
const throttleInterval = 30;
const throttleFlushCount = 20;
const refreshDelay = 300;

// ********************************************************************************************* //

Firebug.TabContext = function(win, browser, chrome, persistedState)
{
    this.window = win;
    this.browser = browser;
    this.persistedState = persistedState;

    this.name = Url.normalizeURL(this.getWindowLocation().toString());

    this.windows = [];
    this.panelMap = {};
    this.sidePanelNames = {};

    this.compilationUnits = {};
    this.sourceFileByTag = {}; // mozilla only

    // New nsITraceableChannel interface (introduced in FF3.0.4) makes possible
    // to re-implement source-cache so that it solves the double-load problem.
    // Anyway, keep the previous cache implementation for backward compatibility
    // (with Firefox 3.0.3 and lower)
    if (Components.interfaces.nsITraceableChannel)
        this.sourceCache = new Firebug.TabCache(this);
    else
        this.sourceCache = new Firebug.SourceCache(this);

    this.global = win;  // used by chromebug

    // -- Back end support --
    this.sourceFileMap = {};  // backend
};

Firebug.TabContext.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Browser Tools Interface BrowserContext

    getCompilationUnit: function(url)
    {
        return this.compilationUnits[url];
    },

    getAllCompilationUnits: function()
    {
        return Firebug.SourceFile.mapAsArray(this.compilationUnits);
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

    addSourceFile: function(sourceFile)
    {
        if (!this.sourceFileMap)
        {
            FBTrace.sysout("tabContext.addSourceFile; ERROR no source map!");
            return;
        }

        this.sourceFileMap[sourceFile.href] = sourceFile;
        sourceFile.context = this;

        this.addTags(sourceFile);

        var kind = CompilationUnit.SCRIPT_TAG;
        if (sourceFile.compilation_unit_type == "event")
            kind = CompilationUnit.BROWSER_GENERATED;

        if (sourceFile.compilation_unit_type == "eval")
            kind = CompilationUnit.EVAL;

        var url = sourceFile.href;
        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("onCompilationUnit " + url, [this, url, kind] );

        Firebug.connection.dispatch("onCompilationUnit", [this, url, kind]);

        // HACKs
        var compilationUnit = this.getCompilationUnit(url);
        if (!compilationUnit)
        {
            if (FBTrace.DBG_COMPILATION_UNITS || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabContext.addSourceFile; ERROR Unknown URL: " + url,
                    this.compilationUnits);
            return;
        }

        compilationUnit.sourceFile = sourceFile;

        compilationUnit.getSourceLines(-1, -1, function onLines(compilationUnit,
            firstLineNumber, lastLineNumber, lines)
        {
            Firebug.connection.dispatch("onSourceLines", arguments);

            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("onSourceLines "+compilationUnit.getURL() + " " + lines.length +
                    " lines", compilationUnit);
        });
    },

    removeSourceFile: function(sourceFile)
    {
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("tabContext.removeSourceFile " + sourceFile.href + " in context " +
                sourceFile.context.getName());

        delete this.sourceFileMap[sourceFile.href];
        delete sourceFile.context;

        // ?? Firebug.onSourceFileDestroyed(this, sourceFile);
    },

    addTags: function(sourceFile)
    {
        if (sourceFile.outerScript)
            this.sourceFileByTag[sourceFile.outerScript.tag] = sourceFile;

        for (var innerTag in sourceFile.innerScripts)
            this.sourceFileByTag[innerTag] = sourceFile;
    },

    getSourceFileByTag: function(tag)
    {
        return this.sourceFileByTag[tag];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // backward compat
    get chrome()
    {
        return Firebug.chrome;
    },

    getCurrentGlobal: function()
    {
        return this.stoppedGlobal || this.baseWindow || this.window;
    },

    destroy: function(state)
    {
        // All existing timeouts need to be cleared
        if (this.timeouts)
        {
            for (var timeout in this.timeouts)
                clearTimeout(timeout);
        }

        // Also all waiting intervals must be cleared.
        if (this.intervals)
        {
            for (var timeout in this.intervals)
                clearInterval(timeout);
        }

        if (this.throttleTimeout)
            clearTimeout(this.throttleTimeout);

        // All existing DOM listeners need to be cleared. Note that context is destroyed
        // when the top level window is unloaded. However, some listeners can be registered
        // to iframes (documents), which can be already unloaded at this point.
        // Removing listeners from such 'unloaded' documents (or window) can throw
        // "TypeError: can't access dead object"
        // We should avoid these exceptions (even if they are not representing memory leaks)
        this.unregisterAllListeners();

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

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("tabContext.destroy " + this.getName() + " set state ", state);
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
            FBTrace.sysout("tabContext.getPanel no prototype " + panelType, panelType);
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

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("tabContext.createPanel; Panel created: " + panel.name, panel);

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
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("tabContext.createPanel panel.mainPanel missing " +
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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabContext.destroy FAILS (" + panelName + ") " + exc, exc);

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

        this.refreshTimeout = this.setTimeout(Obj.bindFixed(function()
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

        }, this), refreshDelay);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Timeouts and Intervals

    setTimeout: function(fn, delay)
    {
        if (setTimeout == this.setTimeout)
            throw new Error("setTimeout recursion");

        // we're using a sandboxed setTimeout function
        var timeout = setTimeout(fn, delay);

        if (!this.timeouts)
            this.timeouts = {};

        this.timeouts[timeout] = 1;

        return timeout;
    },

    clearTimeout: function(timeout)
    {
        // we're using a sandboxed clearTimeout function
        clearTimeout(timeout);

        if (this.timeouts)
            delete this.timeouts[timeout];
    },

    setInterval: function(fn, delay)
    {
        // we're using a sandboxed setInterval function
        var timeout = setInterval(fn, delay);

        if (!this.intervals)
            this.intervals = {};

        this.intervals[timeout] = 1;

        return timeout;
    },

    clearInterval: function(timeout)
    {
        // we're using a sandboxed clearInterval function
        clearInterval(timeout);

        if (this.intervals)
            delete this.intervals[timeout];
    },

    delay: function(message, object)
    {
        this.throttle(message, object, null, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
            if (!Firebug.throttleMessages)
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
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("tabContext.throttle; EXCEPTION " + e, e);
                }

                return false;
            }
        }

        this.throttleQueue.push(message, object, args);

        if (this.throttleTimeout)
            this.clearTimeout(this.throttleTimeout);

        var self = this;
        this.throttleTimeout =
            this.setTimeout(function() { self.flushThrottleQueue(); }, throttleInterval);

        return true;
    },

    flushThrottleQueue: function()
    {
        var queue = this.throttleQueue;

        if (!queue[0])
            FBTrace.sysout("tabContext.flushThrottleQueue no queue[0]", queue);

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
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("tabContext.flushThrottleQueue; EXCEPTION " + e, e);
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
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("tabContext.unregisterAllListeners; (" + l.eventId +
                        ") " + e, e);
                }
            }
        }

        this.listeners = null;
    }
};

// ********************************************************************************************* //
// Registration

return Firebug.TabContext;

// ********************************************************************************************* //
});
