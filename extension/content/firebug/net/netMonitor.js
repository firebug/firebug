/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/options",
    "firebug/chrome/window",
    "firebug/lib/string",
    "firebug/lib/persist",
    "httpmonitor/net/httpActivityObserver",
    "httpmonitor/net/requestObserver",
    "firebug/lib/http",
    "httpmonitor/net/netUtils",
    "firebug/net/netDebugger",
    "firebug/lib/events",
    "firebug/trace/traceListener",
    "firebug/trace/traceModule",

    "httpmonitor/net/netMonitor"
],
function(Obj, Firebug, Firefox, Options, Win, Str, Persist, NetHttpActivityObserver,
    HttpRequestObserver, Http, NetUtils, NetDebugger, Events,
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

        this.addListener(BONHandler);
    },

    shutdown: function()
    {
        HttpMonitorModule.shutdown.apply(this, arguments);

        TraceModule.removeListener(this.traceNetListener);
        TraceModule.removeListener(this.traceActivityListener);

        Firebug.connection.removeListener(this.DebuggerListener);

        this.removeListener(BONHandler);
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

        // Attach page observers (activity observer, http observer, cache listener,
        // load and DOMContentLoaded event handlers, etc.). Some of them are registered
        // now and the others (like cache listener) in real initContext method.
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

        // Put netProgress in to the right context now when it finally exists.
        if (tempContext)
        {
            context.netProgress = tempContext.netProgress;
            context.netProgress.context = context;
            delete this.contexts[tabId];

            // Yet register the rest of the observers (e.g. tab cache)
            this.attachObservers(context);
        }
        else
        {
            // Temp context wasn't created so, use the standard logic.
            HttpMonitorModule.initContext.apply(this, arguments);
        }

        // Load existing breakpoints
        var persistedPanelState = Persist.getPersistedState(context, panelName);
        if (persistedPanelState.breakpoints)
            context.netProgress.breakpoints = persistedPanelState.breakpoints;

        if (!context.netProgress.breakpoints)
            context.netProgress.breakpoints = new NetDebugger.NetBreakpointGroup();

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

    destroyContext: function(context, persistedState)
    {
        Firebug.ActivableModule.destroyContext.apply(this, arguments);
        HttpMonitorModule.destroyContext.apply(this, arguments);

        if (context.netProgress)
        {
            // Remember existing breakpoints.
            var persistedPanelState = Persist.getPersistedState(context, panelName);
            persistedPanelState.breakpoints = context.netProgress.breakpoints;
        }

        //if (Firebug.NetMonitor.isAlwaysEnabled())
        //    unmonitorContext(context);
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
// Break On XHR Listener

var BONHandler =
{
    breakOnXHR: function breakOnXHR(context, file)
    {
        var halt = false;
        var conditionIsFalse = false;

        // If there is an enabled breakpoint with condition:
        // 1) break if the condition is evaluated to true.
        var breakpoints = context.netProgress.breakpoints;
        if (!breakpoints)
            return;

        var bp = breakpoints.findBreakpoint(file.getFileURL());
        if (bp && bp.checked)
        {
            halt = true;
            if (bp.condition)
            {
                halt = bp.evaluateCondition(context, file);
                conditionIsFalse = !halt;
            }
        }

        // 2) If break on XHR flag is set and there is no condition evaluated to false,
        // break with "break on next" breaking cause (this new breaking cause can override
        // an existing one that is set when evaluating a breakpoint condition).
        if (context.breakOnXHR && !conditionIsFalse)
        {
            context.breakingCause = {
                title: Locale.$STR("net.Break On XHR"),
                message: Str.cropString(file.href, 200),
                copyAction: Obj.bindFixed(System.copyToClipboard, System, file.href)
            };

            halt = true;
        }

        // Ignore if there is no reason to break.
        if (!halt)
            return;

        // Even if the execution was stopped at breakpoint reset the global
        // breakOnXHR flag.
        context.breakOnXHR = false;

        Firebug.Breakpoint.breakNow(context.getPanel(panelName, true));
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
