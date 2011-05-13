/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/lib/object",
    "arch/tools",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/firefox/window",
    "firebug/lib/css",
    "firebug/plugin",
],
function(FBL, OBJECT, ToolsInterface, Events, URL, WIN, CSS) {

// ************************************************************************************************
// Constants

var CompilationUnit = ToolsInterface.CompilationUnit;

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

    this.name = URL.normalizeURL(this.getWindowLocation().toString());

    this.windows = [];
    this.panelMap = {};
    this.sidePanelNames = {};

    this.compilationUnits = {};
    this.sourceFileByTag = {}; // mozilla only

    // New nsITraceableChannel interface (introduced in FF3.0.4) makes possible
    // to re-implement source-cache so, it solves the double-load problem.
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
        return WIN.safeGetWindowLocation(this.window);
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
            if (URL.isDataURL(url))
            {
                var props = URL.splitDataURL(url);
                if (props.fileName)
                    this.name = "data url from "+props.fileName;
            }
            else
            {
                this.name = URL.normalizeURL(url);
                if (this.name === "about:blank" && this.window.frameElement)
                    this.name += " in "+CSS.getElementCSSSelector(this.window.frameElement);
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

        this.addTags(sourceFile);

        var kind = CompilationUnit.SCRIPT_TAG;
        if (sourceFile.compilation_unit_type == "event")
            var kind = CompilationUnit.BROWSER_GENERATED;
        if (sourceFile.compilation_unit_type == "eval")
            var kind = CompilationUnit.EVAL;

        var url = sourceFile.href;
        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("onCompilationUnit "+url,[this, url, kind] );

        ToolsInterface.browser.dispatch("onCompilationUnit", [this, url, kind]);

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
            ToolsInterface.browser.dispatch("onSourceLines", arguments);

            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("onSourceLines "+compilationUnit.getURL()+" "+lines.length+
                    " lines", compilationUnit);
        });
    },

    removeSourceFile: function(sourceFile)
    {
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("tabContext.removeSourceFile "+sourceFile.href+" in context "+sourceFile.context.getName());

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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
            FBTrace.sysout("tabContext.destroy "+this.getName()+" set state ", state);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    initPanelTypes: function()
    {
        if (!this.panelTypes)
        {
            this.panelTypes = [];
            this.panelTypeMap = {};
        }
    },

    addPanelType: function(url, title, parentPanel)
    {
        url = URL.absoluteURL(url, this.window.location.href);
        if (!url)
        {
            // XXXjoe Need some kind of notification to console that URL is invalid
            throw("addPanelType: url is invalid!");
            return;
        }

        this.initPanelTypes();

        var name = createPanelName(url);
        while (name in this.panelTypeMap)
            name += "_";

        var panelType = createPanelType(name, url, title, parentPanel);

        this.panelTypes.push(panelType);
        this.panelTypeMap[name] = panelType;

        return panelType;
    },

    addPanelTypeConstructor: function(panelType)
    {
        this.initPanelTypes();
        this.panelTypes.push(panelType);
        var name = panelType.prototype.name;
        this.panelTypeMap[name] = panelType;
    },

    removePanelType: function(url)
    {
        // NYI
    },

    getPanel: function(panelName, noCreate)
    {
        // Get "global" panelType, registered using Firebug.registerPanel
        var panelType = Firebug.getPanelType(panelName);

        // The panelType can be "local", available only within the context.
        if (!panelType && this.panelTypeMap && this.panelTypeMap.hasOwnProperty(panelName))
            panelType = this.panelTypeMap[panelName];

        if (!panelType)
            return null;

        if (!panelType.prototype)
        {
            FBTrace.sysout("tabContext.getPanel no prototype "+panelType, panelType);
            return;
        }
        var enabled = panelType.prototype.isEnabled ? panelType.prototype.isEnabled() : true;

        // Create instance of the panelType only if it's enabled.
        if (enabled)
            return this.getPanelByType(panelType, noCreate);

        return null;
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
            return this.createPanel(panelType);
        }
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
        if (panel.parentPanel) // then this new panel is a side panel
        {
            panel.mainPanel = this.panelMap[panel.parentPanel];
            if (panel.mainPanel) // then our panel map is consistent
                panel.mainPanel.addListener(panel); // wire the side panel to get UI events from the main panel
            else                 // then our panel map is broken, maybe by an extension failure.
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("tabContext.createPanel panel.mainPanel missing "+panel.name+
                        " from "+panel.parentPanel.name);
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
                FBTrace.sysout("tabContext.destroy FAILS "+exc, exc);

            // the destroy failed, don't keep the bad state
            delete state.panelState[panelName];
        }

        // Remove the panel node from the DOM and so delet its content.
        var panelNode = panel.panelNode;
        if (panelNode && panelNode.parentNode)
            panelNode.parentNode.removeChild(panelNode);
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

        this.refreshTimeout = this.setTimeout(OBJECT.bindFixed(function()
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
    panelType.prototype = OBJECT.extend(new Firebug.PluginPanel(),
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
// Registration

return Firebug.TabContext;

// ************************************************************************************************
});
