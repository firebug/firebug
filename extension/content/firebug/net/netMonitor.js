/* See license.txt for terms of usage */

define([
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
    "firebug/trace/traceListener",
    "firebug/trace/traceModule",

    "httpmonitor/net/netMonitor"
],
function(Obj, Firebug, Firefox, Options, Win, Str, Persist, NetHttpActivityObserver,
    HttpRequestObserver, NetProgress, Http, NetUtils, NetDebugger, Events,
    TraceListener, TraceModule, HttpMonitorModule) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "net";

// ********************************************************************************************* //

/**
 * @module Represents a module object for the Net panel. This object is derived
 * from <code>Firebug.ActivableModule</code> in order to support activation (enable/disable).
 * This allows to avoid (performance) expensive features if the functionality is not necessary
 * for the user.
 */
Firebug.NetMonitor = Obj.extend(Firebug.ActivableModule, HttpMonitorModule,
{
    dispatchName: "netMonitor",
    maxQueueRequests: 500,

    // List of temporary contexts, created before initContext is executed.
    contexts: [],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        HttpMonitorModule.initialize.apply(this, arguments);

        this.traceNetListener = new TraceListener("net.", "DBG_NET", true);
        this.traceActivityListener = new TraceListener("activityObserver.",
            "DBG_ACTIVITYOBSERVER", true);

        TraceModule.addListener(this.traceNetListener);
        TraceModule.addListener(this.traceActivityListener);

        Firebug.connection.addListener(this.DebuggerListener);
    },

    shutdown: function()
    {
        HttpMonitorModule.shutdown.apply(this, arguments);

        TraceModule.removeListener(this.traceNetListener);
        TraceModule.removeListener(this.traceActivityListener);

        Firebug.connection.removeListener(this.DebuggerListener);
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

        // xxxHonza:
        // Resume only if NetPanel is enabled and so, observing NetMonitor module.
        /*if (Firebug.NetMonitor.isAlwaysEnabled())
        {
            NetHttpActivityObserver.registerObserver();
            Firebug.connection.eachContext(monitorContext);
        }
        else
        {
            // If the Net panel is not enabled, we needto make sure the unmonitorContext
            // is executed and so, the start button (aka firebug status bar icons) is
            // properly updated.
            NetHttpActivityObserver.unregisterObserver();
            Firebug.connection.eachContext(unmonitorContext);
        }*/
    },

    onSuspendFirebug: function()
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.onSuspendFirebug; enabled: " + Firebug.NetMonitor.isAlwaysEnabled());

        // xxxHonza
        //NetHttpActivityObserver.unregisterObserver();
        //Firebug.connection.eachContext(unmonitorContext);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Document Load Observer

    onLoadDocument: function(request, win)
    {
        var name = Http.safeGetRequestName(request);
        var browser = Firefox.getBrowserForWindow(win);

        if (!Firebug.TabWatcher.shouldCreateContext(browser, name, null))
        {
            if (FBTrace.DBG_NET)
            {
                FBTrace.sysout("netMonitor.onLoadDocument; Activation logic says don't create " +
                    "temp context for: " + name);
            }
            return;
        }

        var tabId = Win.getWindowProxyIdForWindow(win);
        if (!tabId)
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("netMonitor.onLoadDocument; ERROR no Tab ID!");
            return;
        }

        if (this.contexts[tabId])
            return;

        // Initialize NetProgress with a fake parent context. It'll be properly replaced
        // by real context in initContext.
        var browser = Firebug.TabWatcher.getBrowserByWindow(win);
        var context = {window: win, browser: browser};
        this.contexts[tabId] = context;
        context.netProgress = this.initNetContext(context);

        this.attachObservers(context);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("netMonitor.onModifyRequest; Top document loading...");
    },

    initContext: function(context, persistedState)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("netMonitor.initContext for: " + context.getName());

        var win = context.window;
        var tabId = Win.getWindowProxyIdForWindow(win);
        var tempContext = this.contexts[tabId];

        // Put netProgress in to the right context now when it finally exist.
        if (tempContext)
        {
            context.netProgress = tempContext.netProgress;
            context.netProgress.context = context;
            delete this.contexts[tabId];

            // Yet register the rest of the observers (e.g. tab cache)
            this.attachObservers(context);
            return;
        }

        // Temp context wasn't created so, use standard logic.
        HttpMonitorModule.initContext.apply(this, arguments);

        //xxxHonza: needed by NetExport, should be probably somewhere else.
        // Set Page title and id into all document objects.
        /*var netProgress = context.netProgress;
        for (var i=0; i<netProgress.documents.length; i++)
        {
            var doc = netProgress.documents[i];
            doc.id = context.uid;
            doc.title = NetUtils.getPageTitle(context);
        }*/
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // User Actions

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

    syncFilterButtons: function()
    {
        var button = Firebug.chrome.$("fbNetFilter-" + Options.get("netFilterCategory"));
        button.checked = true;
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel(panelName);
        panel.persistContent = panel.persistContent ? false : true;
        Firebug.chrome.setGlobalAttribute("cmd_togglePersistNet", "checked", panel.persistContent);
    },
});

// ********************************************************************************************* //

// xxxHonza
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
// Registration

// Keep compatibility with existing XUL based extensions
// deprecated
Firebug.NetMonitor.Utils = NetUtils;

Firebug.registerActivableModule(Firebug.NetMonitor);

return Firebug.NetMonitor;

// ********************************************************************************************* //
});
