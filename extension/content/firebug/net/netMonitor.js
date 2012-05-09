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
        Firebug.HttpMonitorModule.shutdown.apply(this, arguments);

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
