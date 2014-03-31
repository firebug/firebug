/* See license.txt for terms of usage */

define([
    "firebug/chrome/activableModule",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/options",
    "firebug/chrome/window",
    "firebug/lib/string",
    "firebug/lib/persist",
    "firebug/net/httpActivityObserver",
    "firebug/net/requestObserver",
    "firebug/net/netProgress",
    "firebug/lib/http",
    "firebug/net/netUtils",
    "firebug/net/netDebugger",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/trace/traceListener",
    "firebug/trace/traceModule"
],
function(ActivableModule, Obj, Firebug, Firefox, Options, Win, Str, Persist,
    NetHttpActivityObserver, HttpRequestObserver, NetProgress, Http, NetUtils, NetDebugger,
    Events, Locale, TraceListener, TraceModule) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "net";

var startFile = NetProgress.prototype.startFile;
var openingFile = NetProgress.prototype.openingFile;
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
 * from {@link ActivableModule} in order to support activation (enable/disable).
 * This allows to avoid (performance) expensive features if the functionality is not necessary
 * for the user.
 */
Firebug.NetMonitor = Obj.extend(ActivableModule,
/** @lends Firebug.NetMonitor */
{
    dispatchName: "netMonitor",
    maxQueueRequests: 500,
    contexts: new Array(),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        ActivableModule.initialize.apply(this, arguments);

        this.traceNetListener = new TraceListener("net.", "DBG_NET", true);
        this.traceActivityListener = new TraceListener("activityObserver.",
            "DBG_ACTIVITYOBSERVER", true);

        TraceModule.addListener(this.traceNetListener);
        TraceModule.addListener(this.traceActivityListener);

        Firebug.connection.addListener(this.DebuggerListener);

        NetHttpObserver.registerObserver();
    },

    initializeUI: function()
    {
        ActivableModule.initializeUI.apply(this, arguments);

        // Initialize max limit for logged requests.
        Firebug.NetMonitor.updateMaxLimit();

        // Synchronize UI buttons with the current filter.
        this.syncFilterButtons(Firebug.chrome);

        // Initialize filter button tooltips
        var doc = Firebug.chrome.window.document;
        var filterButtons = doc.getElementsByClassName("fbNetFilter");
        for (var i=0, len=filterButtons.length; i<len; ++i)
        {
            if (filterButtons[i].id != "fbNetFilter-all")
            {
                filterButtons[i].tooltipText = Locale.$STRF("firebug.labelWithShortcut",
                    [filterButtons[i].tooltipText, Locale.$STR("tooltip.multipleFiltersHint")]);
            }
        }

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetMonitor.initializeUI; enabled: " + this.isAlwaysEnabled());
    },

    shutdown: function()
    {
        ActivableModule.shutdown.apply(this, arguments);

        TraceModule.removeListener(this.traceNetListener);
        TraceModule.removeListener(this.traceActivityListener);

        Firebug.connection.removeListener(this.DebuggerListener);

        NetHttpObserver.unregisterObserver();
    },

    initContext: function(context, persistedState)
    {
        ActivableModule.initContext.apply(this, arguments);

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
            };

            if (Options.get("netShowPaintEvents"))
            {
                context.addEventListener(win, "MozAfterPaint", onWindowPaintHandler, false);
            }

            // Register "load" listener in order to track window load time.
            var onWindowLoadHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(windowLoad, [win, NetUtils.now()]);
                context.removeEventListener(win, "load", onWindowLoadHandler, true);

                context.setTimeout(function()
                {
                    if (win && !win.closed)
                    {
                        context.removeEventListener(win, "MozAfterPaint", onWindowPaintHandler, false);
                    }
                }, 2000); //xxxHonza: this should be customizable using preferences.
            };
            context.addEventListener(win, "load", onWindowLoadHandler, true);

            // Register "DOMContentLoaded" listener to track timing.
            var onContentLoadHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(contentLoad, [win, NetUtils.now()]);
                context.removeEventListener(win, "DOMContentLoaded", onContentLoadHandler, true);
            };

            context.addEventListener(win, "DOMContentLoaded", onContentLoadHandler, true);
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
        ActivableModule.showContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.showContext; " + (context ? context.getName() : "NULL") +
                ", temp contexts: " + getTempContextCount());
    },

    loadedContext: function(context)
    {
        var tabId = Win.getWindowProxyIdForWindow(context.browser.contentWindow);
        delete this.contexts[tabId];

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.loadedContext; temp contexts (" + getTempContextCount() + ")");

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

    destroyContext: function(context, persistedState)
    {
        ActivableModule.destroyContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.destroyContext for: " +
                (context ? context.getName() : "No context"));

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
            FBTrace.sysout("net.onObserverChange; hasObservers: " + this.hasObservers() +
                ", Firebug suspended: " + Firebug.getSuspended());

        if (!Firebug.getSuspended())  // then Firebug is in action
            this.onResumeFirebug();   // and we need to test to see if we need to addObserver
    },

    onResumeFirebug: function()
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.onResumeFirebug; enabled: " + Firebug.NetMonitor.isAlwaysEnabled());

        // Resume only if NetPanel is enabled and so, observing NetMonitor module.
        if (Firebug.NetMonitor.isAlwaysEnabled())
        {
            NetHttpActivityObserver.registerObserver();
            Firebug.connection.eachContext(monitorContext);
        }
        else
        {
            // If the Net panel is not enabled, we need to make sure the unmonitorContext
            // is executed and so, the start button (aka Firebug status bar icons) is
            // properly updated.
            NetHttpActivityObserver.unregisterObserver();
            Firebug.connection.eachContext(unmonitorContext);
        }
    },

    onSuspendFirebug: function()
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.onSuspendFirebug; enabled: " + Firebug.NetMonitor.isAlwaysEnabled());

        NetHttpActivityObserver.unregisterObserver();
        Firebug.connection.eachContext(unmonitorContext);
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

    onToggleFilter: function(event, context, filterCategory)
    {
        if (!context.netProgress)
            return;

        var filterCategories = [];
        if (Events.isControl(event) && filterCategory != "all")
        {
            filterCategories = Options.get("netFilterCategories").split(" ");
            var filterCategoryIndex = filterCategories.indexOf(filterCategory);
            if (filterCategoryIndex == -1)
                filterCategories.push(filterCategory);
            else
                filterCategories.splice(filterCategoryIndex, 1);
        }
        else
        {
            filterCategories.push(filterCategory);
        }

        // Remove "all" filter in case several filters are selected
        if (filterCategories.length > 1)
        {
            var allIndex = filterCategories.indexOf("all");
            if (allIndex != -1)
                filterCategories.splice(allIndex, 1);
        }

        // If no filter categories are selected, use the default
        if (filterCategories.length == 0)
            filterCategories = Options.getDefault("netFilterCategories").split(" ");

        Options.set("netFilterCategories", filterCategories.join(" "));

        this.syncFilterButtons(Firebug.chrome);

        Events.dispatch(Firebug.NetMonitor.fbListeners, "onFiltersSet", [filterCategories]);
    },

    syncFilterButtons: function(chrome)
    {
        var filterCategories = new Set();
        Options.get("netFilterCategories").split(" ").forEach(function(element)
        {
            filterCategories.add(element);
        });
        var doc = chrome.window.document;
        var buttons = doc.getElementsByClassName("fbNetFilter");

        for (var i=0, len=buttons.length; i<len; ++i)
        {
            var filterCategory = buttons[i].id.substr(buttons[i].id.search("-") + 1);
            buttons[i].checked = filterCategories.has(filterCategory);
        }
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel(panelName);
        panel.persistContent = panel.persistContent ? false : true;

        Firebug.chrome.setGlobalAttribute("cmd_firebug_togglePersistNet", "checked",
            panel.persistContent);
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

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetHttpObserver.register;");

        HttpRequestObserver.addObserver(this, "firebug-http-event", false);
        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (!this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetHttpObserver.unregister;");

        HttpRequestObserver.removeObserver(this, "firebug-http-event");
        this.registered = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        if (!Firebug.NetMonitor.isAlwaysEnabled())
            return;

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
                if (FBTrace.DBG_NET)
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
            else if (topic == "http-on-opening-request")
                this.openingFile(subject, win, tabId, context);
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

        // If the current context is associated with about:blank, just use it.
        // It's because every opened tab is about:blank first and than changed
        // to the target URL. So, the initContext goes for about:blank and not
        // second time for the real URL. We don't want to crate temporary context
        // and then never use it because initContext isn't fired.
        // This is related to firebug/4040 test and also issue 5916
        // See also {@link TabWatcher.doLocationChange}
        var currContextName = context ? context.getName() : "";

        // We only need to create a new context if this is a top document uri (not frames).
        if ((request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) &&
            request.loadGroup && request.loadGroup.groupObserver &&
            win == win.parent && !isRedirect && currContextName != "about:blank")
        {
            var browser = Firefox.getBrowserForWindow(win);

            if (!Firebug.TabWatcher.shouldCreateContext(browser, name, null))
            {
                if (FBTrace.DBG_NET)
                    FBTrace.sysout("net.onModifyRequest; Activation logic says don't create " +
                        "temp context for: " + name);
                return;
            }

            // Create a new network context prematurely.
            if (!Firebug.NetMonitor.contexts[tabId])
            {
                Firebug.NetMonitor.contexts[tabId] = createNetProgress(null);

                // OK, we definitely want to watch this page load, temporary context is created
                // so, make sure the activity-observer is registered and we have detailed
                // timing info for this first document request.
                NetHttpActivityObserver.registerObserver();

                if (FBTrace.DBG_NET)
                    FBTrace.sysout("net.onModifyRequest; Temp Context created (" +
                        getTempContextCount() + "), " + tabId + ", " + context.getName());
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
            // Even if the Firebug.netShowBFCacheResponses is false now, the user could
            // switch it on later.
            var xhr = Http.isXHR(request);
            networkContext.post(requestedFile, [request, NetUtils.now(), win, xhr]);
        }
    },

    onExamineResponse: function(request, win, tabId, context)
    {
        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        if (!networkContext)
            return;

        var info = new Object();
        info.responseStatus = request.responseStatus;
        info.responseStatusText = request.responseStatusText;

        // Initialize info.postText property.
        info.request = request;
        NetUtils.getPostText(info, context);

        // Get response headers now. They could be replaced by cached headers later
        // (if the response is coming from the cache).
        NetUtils.getHttpHeaders(request, info, context);

        if (FBTrace.DBG_NET && info.postText)
            FBTrace.sysout("net.onExamineResponse, POST data: " + info.postText, info);

        networkContext.post(respondedFile, [request, NetUtils.now(), info]);

        // Make sure to track the first document response.
        //Firebug.TabCacheModel.registerStreamListener(request, win, true);
    },

    onExamineCachedResponse: function(request, win, tabId, context)
    {
        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        if (!networkContext)
        {
            if (FBTrace.DBG_NET_EVENTS)
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

    openingFile: function(request, win, tabId, context)
    {
        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        if (!networkContext)
            return;

        networkContext.post(openingFile, [request, win]);
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
};

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
            FBTrace.sysout("net.monitorContext; Use temporary context: " + tabId);

        networkContext.context = context;
        delete Firebug.NetMonitor.contexts[tabId];
    }
    else
    {
        if (FBTrace.DBG_NET)
        {
            FBTrace.sysout("net.monitorContext; create network monitor context object for: " +
                tabId);
        }

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

    updateStartButton(true);
}

function unmonitorContext(context)
{
    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.unmonitorContext; (" +
            (context ? context.netProgress : "netProgress == NULL") + ") " +
            (context ? context.getName() : "no context"));

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

    updateStartButton(false);

    // And finally destroy the net panel sub context.
    delete context.netProgress;
}

function updateStartButton(enabled)
{
    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.updateStartButton; update start button, enabled: " + enabled);

    var firebugStatus = Firefox.getElementById("firebugStatus");

    // Update status
    if (enabled)
        firebugStatus.setAttribute("net", "on");
    else
        firebugStatus.removeAttribute("net");

    // Update start button tooltip
    if (Firebug.StartButton)
        Firebug.StartButton.resetTooltip();
    else
        FBTrace.sysout("net.updateStartButton; ERROR No Firebug.StartButton ?");
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
 * TabCache listener implementation. Net panel uses this listener to remember all
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
    dispatchName: "NetCacheListener",

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
        if (file && responseText)
            file.responseText = responseText;

        Events.dispatch(Firebug.NetMonitor.fbListeners, "onResponseBody", [context, file]);
    }
};

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

// Keep compatibility with existing XUL based extensions
// deprecated
Firebug.NetMonitor.Utils = NetUtils;

Firebug.registerActivableModule(Firebug.NetMonitor);

return Firebug.NetMonitor;

// ********************************************************************************************* //
});
