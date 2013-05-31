/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/chrome/window",
    "firebug/chrome/tabWatcher",
    "firebug/debugger/debuggerLib",
],
function(Firebug, FBTrace, Win, TabWatcher, DebuggerLib) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DEBUGGERCLIENTTAB");
var TraceError = FBTrace.to("DBG_ERRORS");

var getWinLocation = Win.safeGetWindowLocation;

// ********************************************************************************************* //
// DebuggerClientTab

function DebuggerClientTab(browser, client, listener)
{
    this.browser = browser;
    this.window = browser.contentWindow;
    this.client = client;
    this.listener = listener;
}

/**
 * This object represents a context for JSD2 tab-actor. An instance of this object is created
 * for every Firefox tab with active Firebug context. The main responsibility of this
 * object is to asynchronously attach to the thread actor and store threadClient reference
 * to the context associated with the tab.
 *
 * Events are dispatched to {@debuggerClientTab} object, which is consequently dispatching
 * them to other listeners.
 *
 * Note that both tab-actor and thread-actor live as long as the tab exists
 * and refresh of the tab doesn't cause new actors to be created.
 *
 * Instances of this object are maintained by {@debuggerClientTab} in a weak map
 * where key is the (tab) browser.
 */
DebuggerClientTab.prototype =
/** @lends DebuggerClientTab */
{
    dispatchName: "DebuggerClientTab",

    tabClient: null,
    activeThread: null,
    threadActor: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    /**
     * Attach to the current thread happens in three steps (round-trips with the server)
     * Step I. get list of all available tabs
     * Step II. attach to the current tab.
     * Step III. attach to the current thread.
     * 
     * Note that attach is initiated when 'onResumeFirebug' event is fired (Firebug UI opened).
     */
    attach: function(callback)
    {
        Trace.sysout("debuggerClientTab.attach; " + getWinLocation(this.window));

        this.attachCallback = callback;

        // Step I. get list of all available tabs.
        // Other steps happens asynchronously.
        this.client.listTabs(this.onListTabs.bind(this));
    },

    detach: function(callback)
    {
        this.detachCallback = callback;

        this.detachThread();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attach Helpers

    onListTabs: function(response)
    {
        // If the tab object has been detached in just after 'listTabs' has been send
        // Just ignore rest of the attach sequence.
        // xxxHonza: similar thing should be probably done in onTabAttached + detach the
        // tab immediately.
        if (this.detached)
            return;

        // The response contains list of all tab and global actors registered
        // on the server side. We need to cache it since these IDs will be
        // needed later (for communication to these actors).
        // See also getActorId method.
        this.listTabsResponse = response;

        var tabGrip = response.tabs[response.selected];
        this.attachTab(tabGrip.actor);
    },

    attachTab: function(tabActor)
    {
        Trace.sysout("debuggerClientTab.attachTab; " + getWinLocation(this.window));

        if (this.threadActor || this.tabClient)
        {
            TraceError.sysout("debuggerClientTab.attachTab; ERROR already attached?" +
                getWinLocation(this.window));
            return;
        }

        // Step II. attach to the current tab actor.
        this.client.attachTab(tabActor, this.onTabAttached.bind(this));
    },

    onTabAttached: function(response, tabClient)
    {
        Trace.sysout("debuggerClientTab.onTabAttached; " + getWinLocation(this.window));

        if (this.detached)
        {
            // xxxHonza: we should detach the tab now.
            TraceError.sysout("ERROR: tab already detached!");
        }

        if (!tabClient)
        {
            TraceError.sysout("ERROR: No tab client! " + response.error, response);
            return;
        }

        this.threadActor = response.threadActor;
        this.tabClient = tabClient;

        this.attachThread(response.threadActor);
    },

    attachThread: function(threadActor)
    {
        Trace.sysout("debuggerClientTab.attachThread; " + getWinLocation(this.window));

        // State diagnostics and tracing
        var actor = DebuggerLib.getThreadActor(this.browser);
        Trace.sysout("debuggerClientTab.attachThread; state: " +
            (actor ? actor._state : "no tab actor"));

        // Step III. attach to the current thread actor.
        this.client.attachThread(threadActor, this.onThreadAttached.bind(this));
    },

    onThreadAttached: function(response, threadClient)
    {
        Trace.sysout("debuggerClientTab.onThreadAttached; " + getWinLocation(this.window));

        if (this.detached)
        {
            // xxxHonza: we should detach the thread now.
            TraceError.sysout("ERROR: tab already detached!");
        }

        if (!threadClient)
        {
            var threadActor = DebuggerLib.getThreadActor(this.browser);
            TraceError.sysout("ERROR " + response.error + " (" + threadActor._state +
                ")", response);
            return;
        }

        this.activeThread = threadClient;

        // Update existing context. Note that the context that caused the attach
        // can be already destroyed (e.g. if page refresh happened soon after load).
        var context = TabWatcher.getContextByWindow(this.window);
        if (context)
            context.activeThread = this.activeThread;

        // Execute attach callback if any is provided.
        this.executeCallback(this.attachCallback, [threadClient]);
        this.attachCallback = null

        // Dispatch event to all listeners.
        this.dispatch("onThreadAttached");

        threadClient.resume();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Detach Helpers

    detachThread: function()
    {
        Trace.sysout("debuggerClientTab.detachThread;" + this.activeThread);

        if (this.activeThread)
            this.activeThread.detach(this.onThreadDetached.bind(this));

        this.detached = true;
    },

    onThreadDetached: function(response)
    {
        Trace.sysout("debuggerClientTab.onThreadDetached;", response);

        this.activeThread = null;

        this.detachTab();
    },

    detachTab: function()
    {
        Trace.sysout("debuggerClientTab.detachTab;");

        this.tabClient.detach(this.onTabDetached.bind(this));
    },

    onTabDetached: function(response)
    {
        Trace.sysout("debuggerClientTab.onTabDetached;", response);

        // Execute detach callback if provided.
        this.executeCallback(this.detachCallback, []);
        this.detachCallback = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    dispatch: function(eventName)
    {
        var context = TabWatcher.getContextByWindow(this.window);
        if (!context)
            return;

        this.listener.dispatch(eventName, [context]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    executeCallback: function(callback, args)
    {
        if (!callback)
            return;

        try
        {
            callback.apply(this, args);
        }
        catch (e)
        {
            TraceError.sysout("debuggerClientTab.executeCallback; EXCEPTION" + e, e);
        }
    }
};

// ********************************************************************************************* //
// Registration

return DebuggerClientTab;

// ********************************************************************************************* //
});
