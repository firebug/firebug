/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const throttleTimeWindow = 200;
const throttleMessageLimit = 30;
const throttleInterval = 30;
const throttleFlushCount = 20;

const refreshDelay = 300;

// ************************************************************************************************

Firebug.TabContext = function(win, browser, chrome, persistedState)
{
    this.window = win;
    this.browser = browser;
    this.persistedState = persistedState;

    browser.__defineGetter__("chrome", function() { return Firebug.chrome; }); // backward compat

    this.name = normalizeURL(this.getWindowLocation().toString());

    this.windows = [];
    this.panelMap = {};
    this.sidePanelNames = {};
    this.sourceFileMap = {};

    // New nsITraceableChannel interface (introduced in FF3.0.4) makes possible
    // to re-implement source-cache so, it solves the double-load problem.
    // Anyway, keep the previous cache implementation for backward compatibility
    // (with Firefox 3.0.3 and lower)
    if (Components.interfaces.nsITraceableChannel)
        this.sourceCache = new Firebug.TabCache(this);
    else
        this.sourceCache = new Firebug.SourceCache(this);

    this.global = win;  // used by chromebug
};

Firebug.TabContext.prototype =
{
    getWindowLocation: function()
    {
        return safeGetWindowLocation(this.window);
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
            if (isDataURL(url))
            {
                var props = splitDataURL(url);
                if (props.fileName)
                     this.name = "data url from "+props.fileName;
            }
            else
            {
                this.name = normalizeURL(url);
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
        this.sourceFileMap[sourceFile.href] = sourceFile;
        sourceFile.context = this;

        Firebug.onSourceFileCreated(this, sourceFile);
    },

    removeSourceFile: function(sourceFile)
    {
        delete this.sourceFileMap[sourceFile.href];
        delete sourceFile.context;

        // ?? Firebug.onSourceFileDestroyed(this, sourceFile);
    },
    // ***************************************************************************
    get chrome()  // backward compat
    {
        return Firebug.chrome;
    },

    reattach: function(oldChrome, newChrome)
    {
        for (var panelName in this.panelMap)
        {
            var panel = this.panelMap[panelName];
            panel.detach(oldChrome, newChrome);
            panel.invalid = true;// this will cause reattach on next use

            var panelNode = panel.panelNode;  // delete panel content
            if (panelNode && panelNode.parentNode)
                panelNode.parentNode.removeChild(panelNode);
        }
    },

    destroy: function(state)
    {
        if (this.timeouts)
        {
            for (var timeout in this.timeouts)
                clearTimeout(timeout);
        }

        if (this.intervals)
        {
            for (var timeout in this.intervals)
                clearInterval(timeout);
        }

        if (this.throttleTimeout)
            clearTimeout(this.throttleTimeout);

        state.panelState = {};

        // Inherit panelStates that have not been restored yet
        if (this.persistedState)
        {
            for (var panelName in this.persistedState.panelState)
                state.panelState[panelName] = this.persistedState.panelState[panelName];
        }

        for (var panelName in this.panelMap)
        {
            var panel = this.panelMap[panelName];

            // Create an object to persist state, re-using old one if it was never restored
            var panelState = panelName in state.panelState ? state.panelState[panelName] : {};
            state.panelState[panelName] = panelState;

            try
            {
                // Destroy the panel and allow it to persist extra info to the state object
                panel.destroy(panelState);
            }
            catch(exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("tabContext.destroy FAILS "+exc, exc);
                // the destroy failed, don't keep the bad state
                delete state.panelState[panelName];
            }

            // Remove the panel node from the DOM
            var panelNode = panel.panelNode;  // delete panel content
            if (panelNode && panelNode.parentNode)
                panelNode.parentNode.removeChild(panelNode);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("tabContext.destroy "+this.getName()+" set state ", state);

        // Release all members just to be safe in case somebody leaks this context
        for (var name in this)
            delete this[name];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    addPanelType: function(url, title, parentPanel)
    {
        url = absoluteURL(url, this.window.location.href);
        if (!url)
        {
            // XXXjoe Need some kind of notification to console that URL is invalid
            throw("addPanelType: url is invalid!");
            return;
        }

        if (!this.panelTypes)
        {
            this.panelTypes = [];
            this.panelTypeMap = {};
        }

        var name = createPanelName(url);
        while (name in this.panelTypeMap)
            name += "_";

        var panelType = createPanelType(name, url, title, parentPanel);

        this.panelTypes.push(panelType);
        this.panelTypeMap[name] = panelType;

        return panelType;
    },

    removePanelType: function(url)
    {
        // NYI
    },

    getPanel: function(panelName, noCreate)
    {
        var panelType = Firebug.getPanelType(panelName);
        if (!panelType && this.panelTypeMap)
            panelType = this.panelTypeMap[panelName];  // context local panelType
        //if (FBTrace.DBG_PANELS)                                                                                       /*@expore*/
        //    FBTrace.sysout("tabContext.getPanel name="+panelName+" noCreate="+noCreate+" panelType="+(panelType?panelType.prototype.name:"null")+"\n");  /*@expore*/
        if (panelType)
            return this.getPanelByType(panelType, noCreate);
    },

    getPanelByType: function(panelType, noCreate)
    {
        if (!panelType || !this.panelMap)
            return null;

        var panelName = panelType.prototype.name;
        if ( this.panelMap.hasOwnProperty(panelName) )
        {
            var panel = this.panelMap[panelName];
            //if (FBTrace.DBG_PANELS)
            //    FBTrace.sysout("tabContext.getPanelByType panel in panelMap, .invalid="+panel.invalid+"\n");
            if (panel.invalid)
            {
                var doc = this.chrome.getPanelDocument(panelType);
                panel.reattach(doc);
                delete panel.invalid;
            }

            return panel;
        }
        else if (!noCreate)
        {
            //if (FBTrace.DBG_PANELS) FBTrace.sysout("tabContext.getPanelByType panel NOT in panelMap\n");
            var panel = new panelType();  // This is why panels are defined by prototype inheritance
            var doc = this.chrome.getPanelDocument(panelType);
            panel.initialize(this, doc);

            return this.panelMap[panel.name] = panel;
        }
    },

    setPanel: function(panelName, panel)  // allows a panel from one context to be used in other contexts.
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

        this.refreshTimeout = this.setTimeout(bindFixed(function()
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    setTimeout: function()
    {
        if (setTimeout == this.setTimeout)
            throw new Error("setTimeout recursion");
        var timeout = setTimeout.apply(top, arguments);

        if (!this.timeouts)
            this.timeouts = {};

        this.timeouts[timeout] = 1;

        return timeout;
    },

    clearTimeout: function(timeout)
    {
        clearTimeout(timeout);

        if (this.timeouts)
            delete this.timeouts[timeout];
    },

    setInterval: function()
    {
        var timeout = setInterval.apply(top, arguments);

        if (!this.intervals)
            this.intervals = {};

        this.intervals[timeout] = 1;

        return timeout;
    },

    clearInterval: function(timeout)
    {
        clearInterval(timeout);

        if (this.intervals)
            delete this.intervals[timeout];
    },

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
            if (!Firebug.throttleMessages)
            {
                message.apply(object, args);
                return false;
            }

            // Count how many messages have been logged during the throttle period
            var logTime = new Date().getTime();
            if (logTime - this.lastMessageTime < throttleTimeWindow)
                ++this.throttleBuildup;
            else
                this.throttleBuildup = 0;

            this.lastMessageTime = logTime;

            // If the throttle limit has been passed, enqueue the message to be logged later on a timer,
            // otherwise just execute it now
            if (!this.throttleQueue.length && this.throttleBuildup <= throttleMessageLimit)
            {
                message.apply(object, args);
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
            queue[i].apply(queue[i+1], queue[i+2]);

        queue.splice(0, throttleFlushCount*3);

        if (queue.length)
        {
            var self = this;
            this.throttleTimeout =
                this.setTimeout(function f() { self.flushThrottleQueue(); }, throttleInterval);
        }
        else
            this.throttleTimeout = 0;
    }
};

// ************************************************************************************************
// Local Helpers

function createPanelType(name, url, title, parentPanel)
{
    var panelType = new Function("");
    panelType.prototype = extend(new Firebug.PluginPanel(),
    {
        name: name,
        url: url,
        title: title ? title : "...",
        parentPanel: parentPanel
    });

    return panelType;
}

function createPanelName(url)
{
    return url.replace(/[:\\\/\s\.\?\=\&\~]/g, "_");
}

// ************************************************************************************************

}});
