/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/chrome/window",
    "firebug/chrome/tabWatcher",
],
function(Firebug, FBTrace, Win, TabWatcher) {

// ********************************************************************************************* //
// Constants

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
    // Initialization

    /**
     * Attach to the current thread happens in three steps (round-trips with the server)
     * Step I. get list of all available tabs
     * Step II. attach to the current tab.
     * Step III. attach to the current thread.
     * 
     * Note that attach is initiated when 'onResumeFirebug' event is fired (Firebug UI opened).
     */
    attach: function()
    {
        Trace.sysout("debuggerClientTab.attach; " + getWinLocation(this.window));

        // Step I. get list of all available tabs.
        // Other steps happens asynchronously.
        this.client.listTabs(this.onListTabs.bind(this));
    },

    detach: function()
    {
        // Does the tab and thread actors detach automatically?
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attach Helpers

    onListTabs: function(response)
    {
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

        // Step II. attach to the current tab actor.
        this.client.attachTab(tabActor, this.onTabAttached.bind(this));
    },

    onTabAttached: function(response, tabClient)
    {
        Trace.sysout("debuggerClientTab.onTabAttached; " + getWinLocation(this.window));

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

        // Step III. attach to the current thread actor.
        this.client.attachThread(threadActor, this.onThreadAttached.bind(this));
    },

    onThreadAttached: function(response, threadClient)
    {
        Trace.sysout("debuggerClientTab.onThreadAttached; " + getWinLocation(self.window));

        if (!threadClient)
        {
            TraceError.sysout("ERROR No tab thread! " + response.error, response);
            return;
        }

        this.activeThread = threadClient;

        // Update existing context. Note that the context that caused the attach
        // can be already destroyed (e.g. if page refresh happened soon after load).
        var context = TabWatcher.getContextByWindow(this.window);
        if (context)
            context.activeThread = this.activeThread;

        this.dispatch("onThreadAttached");

        threadClient.resume();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    dispatch: function(eventName)
    {
        var context = TabWatcher.getContextByWindow(this.window);
        if (!context)
            return;

        this.listener.dispatch(eventName, [context]);
    },
};

// ********************************************************************************************* //
// Registration

return DebuggerClientTab;

// ********************************************************************************************* //
});
