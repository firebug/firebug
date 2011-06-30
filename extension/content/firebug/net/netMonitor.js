/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/firefox/firefox",
    "firebug/lib/options",
    "firebug/firefox/window",
    "firebug/lib/string",
    "firebug/lib/persist",
    "firebug/net/httpActivityObserver",
    "firebug/net/requestObserver",
    "firebug/net/netProgress",
    "firebug/net/httpLib",
    "firebug/net/netUtils",
    "firebug/net/netDebugger",
    "firebug/lib/events",
],
function(Obj, Firebug, Firefox, Options, Win, Str, Persist, NetHttpActivityObserver,
    HttpRequestObserver, NetProgress, Http, NetUtils, NetDebugger, Events) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "net";

var startFile = NetProgress.prototype.startFile;
var requestedFile = NetProgress.prototype.requestedFile;
var respondedFile = NetProgress.prototype.respondedFile;
var respondedCacheFile = NetProgress.prototype.respondedCacheFile;
var windowPaint = NetProgress.prototype.windowPaint;
var timeStamp = NetProgress.prototype.timeStamp;
var windowLoad = NetProgress.prototype.windowLoad;
var contentLoad = NetProgress.prototype.contentLoad;

// ********************************************************************************************* //

/**
 * @module Represents a module object for the Net panel. This object is derived
 * from <code>Firebug.ActivableModule</code> in order to support activation (enable/disable).
 * This allows to avoid (performance) expensive features if the functionality is not necessary
 * for the user.
 */
Firebug.NetMonitor = Obj.extend(Firebug.ActivableModule,
{
    dispatchName: "netMonitor",
    maxQueueRequests: 500,
    contexts: new Array(),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.ActivableModule.initialize.apply(this, arguments);

        if (Firebug.TraceModule)
            Firebug.TraceModule.addListener(this.TraceListener);

        // HTTP observer must be registered now (and not in monitorContext, since if a
        // page is opened in a new tab the top document request would be missed otherwise.
        //Firebug.NetMonitor.NetHttpObserver.registerObserver();
        //NetHttpActivityObserver.registerObserver();

        Firebug.connection.addListener(this.DebuggerListener);
    },

    initializeUI: function()
    {
        Firebug.ActivableModule.initializeUI.apply(this, arguments);

        // Initialize max limit for logged requests.
        Firebug.NetMonitor.updateMaxLimit();

        // Synchronize UI buttons with the current filter.
        this.syncFilterButtons(Firebug.chrome);
    },

    shutdown: function()
    {
        Firebug.ActivableModule.shutdown.apply(this, arguments);

        if (Firebug.TraceModule)
            Firebug.TraceModule.removeListener(this.TraceListener);

        //Firebug.NetMonitor.NetHttpObserver.unregisterObserver();
        //NetHttpActivityObserver.unregisterObserver();

        Firebug.connection.removeListener(this.DebuggerListener);
    },

    initContext: function(context, persistedState)
    {
        Firebug.ActivableModule.initContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.initContext for: " + context.getName());

        // XXXjjb changed test to instanceof because jetpack uses fake window objects
        if (context.window && context.window instanceof Window)
        {
            var win = context.window;

            var onWindowPaintHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(windowPaint, [win, NetUtils.now()]);
            }

            if (Options.get("netShowPaintEvents"))
            {
                win.addEventListener("MozAfterPaint", onWindowPaintHandler, false);
            }

            // Register "load" listener in order to track window load time.
            var onWindowLoadHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(windowLoad, [win, NetUtils.now()]);
                win.removeEventListener("load", onWindowLoadHandler, true);

                context.setTimeout(function()
                {
                    if (win && !win.closed)
                    {
                        win.removeEventListener("MozAfterPaint", onWindowPaintHandler, false);
                    }
                }, 2000); //xxxHonza: this should be customizable using preferences.
            }
            win.addEventListener("load", onWindowLoadHandler, true);

            // Register "DOMContentLoaded" listener to track timing.
            var onContentLoadHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(contentLoad, [win, NetUtils.now()]);
                win.removeEventListener("DOMContentLoaded", onContentLoadHandler, true);
            }

            win.addEventListener("DOMContentLoaded", onContentLoadHandler, true);
        }

        if (Firebug.NetMonitor.isAlwaysEnabled())
            monitorContext(context);

        if (context.netProgress)
        {
            // Load existing breakpoints
            var persistedPanelState = Persist.getPersistedState(context, panelName);
            if (persistedPanelState.breakpoints)
                context.netProgress.breakpoints = persistedPanelState.breakpoints;
        }
    },

    showContext: function(browser, context)
    {
        Firebug.ActivableModule.showContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.showContext; " + (context ? context.getName() : "NULL") +
                ", temp contexts: " + getTempContextCount());
    },

    loadedContext: function(context)
    {
        var tabId = Win.getWindowProxyIdForWindow(context.browser.contentWindow);
        delete this.contexts[tabId];

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.loadedContext; temp contexts (" +
                getTempContextCount() + "), removed one for: " + tabId);

        var netProgress = context.netProgress;
        if (netProgress)
        {
            netProgress.loaded = true;

            // Set Page title and id into all document objects.
            for (var i=0; i<netProgress.documents.length; i++)
            {
                var doc = netProgress.documents[i];
                doc.id = context.uid;
                doc.title = NetUtils.getPageTitle(context);
            }
        }
    },

    reattachContext: function(browser, context)
    {
        Firebug.ActivableModule.reattachContext.apply(this, arguments);
        this.syncFilterButtons(Firebug.chrome);
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.ActivableModule.destroyContext.apply(this, arguments);

        if (context.netProgress)
        {
            // Remember existing breakpoints.
            var persistedPanelState = Persist.getPersistedState(context, panelName);
            persistedPanelState.breakpoints = context.netProgress.breakpoints;
        }

        if (Firebug.NetMonitor.isAlwaysEnabled())
            unmonitorContext(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activable Module

    onObserverChange: function(observer)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.onObserverChange; hasObservers: " + this.hasObservers());

        if (!Firebug.getSuspended())  // then Firebug is in action
            this.onResumeFirebug();   // and we need to test to see if we need to addObserver
    },

    onResumeFirebug: function()
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.onResumeFirebug; enabled: " + Firebug.NetMonitor.isAlwaysEnabled());

        // Resume only if enabled.
        if (Firebug.NetMonitor.isAlwaysEnabled() || this.hasObservers())
        {
            // XXXjjb Honza was called in firebug-http-observer.js on old enableXULWindow
            // Can't be here since resuming happens when the page is loaded and it's too
            // late since the first (document) requests already happened.
            NetHttpObserver.registerObserver();
            NetHttpActivityObserver.registerObserver();
            Firebug.connection.eachContext(monitorContext);
            this.observing = true;
        }
    },

    onSuspendFirebug: function()
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.onSuspendFirebug; enabled: " + Firebug.NetMonitor.isAlwaysEnabled());

        // Suspend only if enabled.
        if (this.observing)
        {
            NetHttpObserver.unregisterObserver();
            Firebug.connection.eachContext(unmonitorContext);
            NetHttpActivityObserver.unregisterObserver();
            this.observing = false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // User Actions

    clear: function(context)
    {
        // The user pressed a Clear button so, remove content of the panel...
        var panel = context.getPanel(panelName, true);
        if (panel)
            panel.clear();
    },

    onToggleFilter: function(context, filterCategory)
    {
        if (!context.netProgress)
            return;

        Options.set("netFilterCategory", filterCategory);

        // The content filter has been changed. Make sure that the content
        // of the panel is updated (CSS is used to hide or show individual files).
        var panel = context.getPanel(panelName, true);
        if (panel)
        {
            panel.setFilter(filterCategory);
            panel.updateSummaries(NetUtils.now(), true);
        }
    },

    syncFilterButtons: function(chrome)
    {
        var button = chrome.$("fbNetFilter-" + Firebug.netFilterCategory);
        button.checked = true;
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel(panelName);
        panel.persistContent = panel.persistContent ? false : true;
        Firebug.chrome.setGlobalAttribute("cmd_togglePersistNet", "checked", panel.persistContent);
    },

    updateOption: function(name, value)
    {
        if (name == "net.logLimit")
            this.updateMaxLimit();
    },

    updateMaxLimit: function()
    {
        var value = Options.get("net.logLimit");
        this.maxQueueRequests = value ? value : this.maxQueueRequests;
    },

    addTimeStamp: function(context, time, label, color)
    {
        if (context.netProgress)
            context.netProgress.post(timeStamp, [context.window, time, label, color]);
    }
});

// ********************************************************************************************* //

// HTTP Observer

// HTTP listener - based on HttpRequestObserver module
// This observer is used for observing the first document http-on-modify-request
// and http-on-examine-response events, which are fired before the context
// is initialized (initContext method call). Without this observer this events
// would be lost and the time measuring would be wrong.
//
// This observer stores these early requests in helper array (contexts) and maps
// them to appropriate tab - initContext then uses the array in order to access it.

var NetHttpObserver =
{
    dispatchName: "NetHttpObserver",
    registered: false,

    registerObserver: function()
    {
        if (this.registered)
            return;

        HttpRequestObserver.addObserver(this, "firebug-http-event", false);
        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (!this.registered)
            return;

        HttpRequestObserver.removeObserver(this, "firebug-http-event");
        this.registered = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        try
        {
            if (FBTrace.DBG_NET_EVENTS)
            {
                FBTrace.sysout("net.events.observe " + (topic ? topic.toUpperCase() : topic) +
                    ", " + ((subject instanceof Ci.nsIRequest) ? Http.safeGetRequestName(subject) : "") +
                    ", Browser: " + Firebug.chrome.window.document.title);
            }

            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            var win = Http.getWindowForRequest(subject);
            var context = Firebug.connection.getContextByWindow(win);

            // The context doesn't have to exist yet. In such cases a temp Net context is
            // created within onModifyRequest.

            // Some requests are not associated with any page (e.g. favicon).
            // These are ignored as Net panel shows only page requests.
            var tabId = win ? Win.getWindowProxyIdForWindow(win) : null;
            if (!tabId)
            {
                if (FBTrace.DBG_NET_EVENTS)
                    FBTrace.sysout("net.observe NO TAB " + Http.safeGetRequestName(subject) +
                        ", " + tabId + ", " + win);
                return;
            }

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win, tabId, context);
            else if (topic == "http-on-examine-response")
                this.onExamineResponse(subject, win, tabId, context);
            else if (topic == "http-on-examine-cached-response")
                this.onExamineCachedResponse(subject, win, tabId, context);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win, tabId, context)
    {
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        var isRedirect = (name != origName);

        // We only need to create a new context if this is a top document uri (not frames).
        if ((request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) &&
            request.loadGroup && request.loadGroup.groupObserver &&
            win == win.parent && !isRedirect)
        {
            var browser = Firefox.getBrowserForWindow(win);

            /*
            if (!Firebug.TabWatcher.shouldCreateContext(browser, name, null))
            {
                if (FBTrace.DBG_NET)
                    FBTrace.sysout("net.onModifyRequest; Activation logic says don't create temp context.");
                return;
            }
            */

            // Create a new network context prematurely.
            if (!Firebug.NetMonitor.contexts[tabId])
            {
                Firebug.NetMonitor.contexts[tabId] = createNetProgress(null);

                if (FBTrace.DBG_NET)
                    FBTrace.sysout("net.onModifyRequest; Create Temp Context (" +
                        getTempContextCount() + "), " + tabId);
            }
        }

        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        if (networkContext)
        {
            networkContext.post(startFile, [request, win]);

            // We need to track the request now since the activity observer is not used in case
            // the response comes from BF cache. If it's a regular HTTP request the timing
            // is properly overridden by the activity observer (ACTIVITY_SUBTYPE_REQUEST_HEADER).
            if (Firebug.netShowBFCacheResponses || !Ci.nsIHttpActivityDistributor)
            {
                var xhr = Http.isXHR(request);
                networkContext.post(requestedFile, [request, NetUtils.now(), win, xhr]);
            }
        }
    },

    onExamineResponse: function(request, win, tabId, context)
    {
        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        var info = new Object();
        info.responseStatus = request.responseStatus;
        info.responseStatusText = request.responseStatusText;

        // Initialize info.postText property.
        info.request = request;
        NetUtils.getPostText(info, context);

        if (FBTrace.DBG_NET && info.postText)
            FBTrace.sysout("net.onExamineResponse, POST data: " + info.postText, info);

        if (networkContext)
            networkContext.post(respondedFile, [request, NetUtils.now(), info]);
    },

    onExamineCachedResponse: function(request, win, tabId, context)
    {
        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        if (!networkContext)
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.onExamineCachedResponse; No CONTEXT for:" +
                    Http.safeGetRequestName(request));
            return;
        }

        var info = new Object();
        info.responseStatus = request.responseStatus;
        info.responseStatusText = request.responseStatusText;

        // Initialize info.postText property.
        info.request = request;
        NetUtils.getPostText(info, context);

        networkContext.post(respondedCacheFile, [request, NetUtils.now(), info]);
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserver)) {
             return this;
         }

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
}

// ********************************************************************************************* //
// Monitoring start/stop

function monitorContext(context)
{
    if (context.netProgress)
        return;

    var networkContext = null;

    // Use an existing context associated with the browser tab if any
    // or create a pure new network context.
    if (context.window)
    {
        var tabId = Win.getWindowProxyIdForWindow(context.window);
        networkContext = Firebug.NetMonitor.contexts[tabId];
    }

    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.monitorContext; (" + networkContext + ") " +
            tabId + ", " + context.getName());

    if (networkContext)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.monitorContext; Use temporary context." + tabId);

        networkContext.context = context;
        delete Firebug.NetMonitor.contexts[tabId];
    }
    else
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.monitorContext; create network monitor context object for: " +
                tabId);

        networkContext = createNetProgress(context);
    }

    // Register activity-distributor observer if available (#488270)
    //NetHttpActivityObserver.registerObserver();

    context.netProgress = networkContext;

    // Add cache listener so, net panel has always fresh responses.
    // Safe to call multiple times.
    networkContext.cacheListener.register(context.sourceCache);

    // Activate net panel sub-context.
    var panel = context.getPanel(panelName);
    context.netProgress.activate(panel);

    // Display info message, but only if the panel isn't just reloaded or Persist == true.
    if (!context.persistedState)
        panel.insertActivationMessage();

    // Update status bar icon.
    Firefox.getElementById('firebugStatus').setAttribute("net", "on");
}

function unmonitorContext(context)
{
    if (FBTrace.DBG_NET && context)
        FBTrace.sysout("net.unmonitorContext; (" + context.netProgress + ") " + context.getName());

    var netProgress = context ? context.netProgress : null;
    if (!netProgress)
        return;

    // Since the print into the UI is done by timeout asynchronously,
    // make sure there are no requests left.
    var panel = context.getPanel(panelName, true);
    if (panel)
        panel.updateLayout();

    //NetHttpActivityObserver.unregisterObserver();

    // Remove cache listener. Safe to call multiple times.
    netProgress.cacheListener.unregister();

    // Deactivate net sub-context.
    context.netProgress.activate(null);

    // Update status bar icon.
    Firefox.getElementById('firebugStatus').removeAttribute("net");

    // And finaly destroy the net panel sub context.
    delete context.netProgress;
}

function createNetProgress(context)
{
    var netProgress = new NetProgress(context);
    netProgress.cacheListener = new NetCacheListener(netProgress);
    netProgress.breakpoints = new NetDebugger.NetBreakpointGroup();
    return netProgress;
}

// ********************************************************************************************* //
// TabCache Listener

/**
 * TabCache listner implementation. Net panel uses this listner to remember all
 * responses stored into the cache. There can be more requests to the same URL that
 * returns different responses. The Net panels must remember all of them (tab cache
 * remembers only the last one)
 */
function NetCacheListener(netProgress)
{
    this.netProgress = netProgress;
    this.cache = null;
}

NetCacheListener.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    register: function(cache)
    {
        if (this.cache)
            return;

        this.cache = cache;
        this.cache.addListener(this);
    },

    unregister: function()
    {
        if (!this.cache)
            return;

        this.cache.removeListener(this);
        this.cache = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Cache Listener

    onStartRequest: function(context, request)
    {
        // Keep in mind that the file object (representing the request) doesn't have to be
        // created at this moment (top document request).
    },

    onStopRequest: function(context, request, responseText)
    {
        // Remember the response for this request.
        var file = this.netProgress.getRequestFile(request, null, true);
        if (file)
            file.responseText = responseText;

        Events.dispatch(Firebug.NetMonitor.fbListeners, "onResponseBody", [context, file]);
    }
}

// ********************************************************************************************* //
// Debugger Listener

Firebug.NetMonitor.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (context.netProgress && !context.netProgress.breakpoints.isEmpty())
            groups.push(context.netProgress.breakpoints);
    },
};

// ********************************************************************************************* //
// Trace Listener

Firebug.NetMonitor.TraceListener =
{
    // Called when console window is loaded.
    onLoadConsole: function(win, rootNode)
    {
    },

    // Called when a new message is logged in to the trace-console window.
    onDump: function(message)
    {
        var index = message.text.indexOf("net.");
        if (index == 0)
        {
            message.text = message.text.substr("net.".length);
            message.text = Str.trim(message.text);
            message.type = "DBG_NET";
        }

        var prefix = "activityObserver.";
        var index = message.text.indexOf(prefix);
        if (index == 0)
        {
            message.text = message.text.substr(prefix.length);
            message.text = Str.trim(message.text);
            message.type = "DBG_ACTIVITYOBSERVER";
        }
    }
};

// ********************************************************************************************* //
// Tracing support

function getTempContextCount()
{
    var counter = 0;
    for (var p in Firebug.NetMonitor.contexts)
        counter++;
    return counter;
}

// ********************************************************************************************* //
// Registration

Firebug.registerActivableModule(Firebug.NetMonitor);

return Firebug.NetMonitor;

// ********************************************************************************************* //
});
