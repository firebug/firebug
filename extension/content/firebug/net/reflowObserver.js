/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/net/netMonitor",
    "firebug/chrome/tabWatcher",
],
function(Obj, Firebug, FBTrace, Options, NetMonitor, TabWatcher) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// ********************************************************************************************* //
// Model implementation

var ReflowObserver = Obj.extend(Firebug.Module,
{
    dispatchName: "reflowObserver",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
    },

    shutdown: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context)
    {
        // Reflow timing is using DOMHighResTimeStamp type, which is used to store a time value
        // measured relative to the navigationStart attribute of the PerformanceTiming interface.
        this.navigationStart = context.window.performance.timing.navigationStart;

        if (Options.get("netShowReflowEvents"))
            this.addObserver(context);
    },

    destroyContext: function(context)
    {
        this.removeObserver(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        FBTrace.sysout("name " + name + ", "  + value);

        if (name != "netShowReflowEvents")
            return;

        var self = this;
        TabWatcher.iterateContexts(function(context)
        {
            if (value)
                self.addObserver(context);
            else
                self.removeObserver(context);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addObserver: function(context)
    {
        var browser = context.browser;

        // The support has been introduced in Firefox 24
        if (typeof(browser.docShell.addWeakReflowObserver) == "undefined")
            return;

        try
        {
            browser.docShell.addWeakReflowObserver(this);
        }
        catch (e)
        {
            FBTrace.sysout("reflowObserver.addObserver; ", e);
        }
    },

    removeObserver: function(context)
    {
        var browser = context.browser;

        // The support has been introduced in Firefox 24
        if (typeof(browser.docShell.removeWeakReflowObserver) == "undefined")
            return;

        try
        {
            browser.docShell.removeWeakReflowObserver(this);
        }
        catch (e)
        {
            // xxxHonza: the current logic can execute remove without add so,
            // do not show the exception. Should be improved.
            //FBTrace.sysout("reflowObserver.removeObserver; ", e);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIReflowObserver

    // xxxHonza: TODO
    // 1) localization
    // 2) Firebug.currentContext must not be used.
    // 3) Time info tip can have a lot of events (the same for moz after paint).
    reflow: function(start, end)
    {
        var startTime = new Date(this.navigationStart + start);
        NetMonitor.addTimeStamp(Firebug.currentContext, startTime, "Reflow");
    },

    reflowInterruptible: function(start, end)
    {
        var startTime = new Date(this.navigationStart + start);
        NetMonitor.addTimeStamp(Firebug.currentContext, startTime, "Reflow Interruptible");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsISupports

    QueryInterface : function(iid)
    {
        if (Ci.nsIReflowObserver.equals(iid) ||
            Ci.nsISupportsWeakReference.equals(iid) ||
            Ci.nsISupports.equals(iid))
        {
            return this;
        }

        throw Cr.NS_NOINTERFACE;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ReflowObserver);

return ReflowObserver;

// ********************************************************************************************* //
});
