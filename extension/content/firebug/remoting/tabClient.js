/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/window",
    "firebug/chrome/tabWatcher",
    "firebug/chrome/eventSource",
    "firebug/chrome/firefox",
    "firebug/debugger/debuggerLib",
],
function(Firebug, FBTrace, Obj, Win, TabWatcher, EventSource, Firefox, DebuggerLib) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_TABCLIENT");
var TraceError = FBTrace.toError();

var getWinLocation = Win.safeGetWindowLocation;

// ********************************************************************************************* //
// TabClient Implementation

/**
 * @param {Object} browser Reference to the browser instance associated with the tab
 * we wrap in this object.
 * @param {DebuggerClient} Reference to the {@link DebuggerClient} object representing
 * the connection to the backend.
 */
function TabClient(browser, client)
{
    this.browser = browser;
    this.window = browser.contentWindow;
    this.client = client;
}

/**
 * This object represents a context for JSD2 tab-actor. An instance of this object is created
 * for every Firefox tab with active Firebug context. The main responsibility of this
 * object is to asynchronously attach to the thread actor and store threadClient reference
 * to the context associated with the tab.
 *
 * Events are dispatched to {@link TabClient} object, which is consequently dispatching
 * them to other listeners.
 *
 * Note that both tab-actor and thread-actor live as long as the tab exists
 * and refresh of the tab doesn't cause new actors to be created.
 *
 * Instances of this object are maintained by {@link TabClient} in a weak map
 * where key is the (tab) browser.
 */
TabClient.prototype = Obj.extend(new EventSource(),
/** @lends TabClient */
{
    dispatchName: "TabClient",

    tabClient: null,
    activeThread: null,
    threadActor: null,
    tabAttached: false,
    threadAttached: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    /**
     * Attach to the current tab happens in two steps (round-trips to the server).
     * Step I. get list of all available tabs
     * Step II. attach to the current tab.
     */
    attach: function(callback)
    {
        Trace.sysout("tabClient.attach; " + getWinLocation(this.window));

        // If set to true the attach process already started. If this.tabClient is
        // set, the process has been also finished.
        if (this.tabAttached)
            return;

        this.attachCallback = callback;
        this.tabAttached = true;

        // Step I. get list of all available tabs (happens asynchronously).
        this.client.listTabs(this.onListTabs.bind(this));
    },

    detach: function(callback)
    {
        Trace.sysout("tabClient.detach; " + getWinLocation(this.window));

        if (!this.tabAttached)
            return;

        this.detachCallback = callback;
        this.tabAttached = false;

        this.detachTab();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attach TabActor

    onListTabs: function(response)
    {
        // If the tab object has been detached in just after 'listTabs' has been send
        // Just ignore rest of the attach sequence.
        if (!this.tabAttached)
            return;

        // The response contains list of all tab and global actors registered
        // on the server side. We need to cache it since these IDs will be
        // needed later (for communication to these actors).
        // See also getActorId method.
        this.listTabsResponse = response;

        // Attach to the currently selected tab.
        var tabGrip = response.tabs[response.selected];
        this.attachTab(tabGrip.actor);
    },

    attachTab: function(tabActor)
    {
        Trace.sysout("tabClient.attachTab; " + getWinLocation(this.window));

        if (this.threadActor || this.tabClient)
        {
            TraceError.sysout("tabClient.attachTab; ERROR already attached?" +
                getWinLocation(this.window));
            return;
        }

        // Step II. attach to the current tab actor.
        this.client.attachTab(tabActor, this.onTabAttached.bind(this));
    },

    onTabAttached: function(response, tabClient)
    {
        Trace.sysout("tabClient.onTabAttached; " + getWinLocation(this.window));

        if (!this.tabAttached)
        {
            TraceError.sysout("ERROR: tab already detached!");
            return;
        }

        if (!tabClient)
        {
            TraceError.sysout("ERROR: No tab client! " + response.error, response);
            return;
        }

        this.threadActor = response.threadActor;
        this.tabClient = tabClient;

        // Execute attach callback if any is provided.
        this.executeCallback(this.attachCallback, [tabClient, this.threadActor]);
        this.attachCallback = null

        var browser = Firefox.getBrowserForWindow(this.window);
        this.dispatch("onTabAttached", [browser]);
    },

    detachTab: function()
    {
        Trace.sysout("tabClient.detachTab;");

        this.tabClient.detach(this.onTabDetached.bind(this));
    },

    onTabDetached: function(response)
    {
        Trace.sysout("tabClient.onTabDetached;", response);

        // Execute detach callback if provided.
        this.executeCallback(this.detachCallback);
        this.detachCallback = null;

        var browser = Firefox.getBrowserForWindow(this.window);
        this.dispatch("onTabDetached", [browser]);

        this.tabClient = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attach ThreadActor

    attachThread: function()
    {
        Trace.sysout("tabClient.attachThread; " + getWinLocation(this.window));

        if (this.threadAttached)
        {
            TraceError.sysout("tabClient.attachThread; ERROR already attached");
            return;
        }

        if (!this.threadActor)
        {
            TraceError.sysout("tabClient.attachThread; ERROR no thread actor");
            return;
        }

        // State diagnostics and tracing
        if (Trace.active)
        {
            var actor = DebuggerLib.getThreadActor(this.browser);
            Trace.sysout("tabClient.attachThread; state: " +
                (actor ? actor._state : "no tab actor"));
        }

        this.threadAttached = true;

        this.client.attachThread(this.threadActor, this.onThreadAttached.bind(this));
    },

    onThreadAttached: function(response, threadClient)
    {
        Trace.sysout("tabClient.onThreadAttached; " + getWinLocation(this.window),
            response);

        if (!this.threadAttached)
        {
            TraceError.sysout("tabClient.onThreadAttached; ERROR: detached");
            return;
        }

        if (!threadClient)
        {
            var threadActor = DebuggerLib.getThreadActor(this.browser);
            TraceError.sysout("ERROR " + response.error + " (" + threadActor._state +
                ")", response);
            return;
        }

        if (response.type != "paused")
        {
            TraceError.sysout("tabClient.onThreadAttached; ERROR wrong type: " +
                response.type);
            return;
        }

        this.activeThread = threadClient;

        // Update existing context. Note that the context that caused the attach
        // can be already destroyed (e.g. if page refresh happened soon after load)
        // and new one created. This isn't a problem since the threadActor is created
        // for the tab and shares its life time. So, every context created within this
        // tab will use the same tabActor anyway.
        var context = TabWatcher.getContextByWindow(this.window);
        if (context)
            context.activeThread = threadClient;

        // Dispatch event to all listeners.
        this.dispatch("onThreadAttached", [context]);

        // The 'onThreadAttached' event has been handled by all listeners, and so all
        // 'debugger-attached' related steps are done. We can resume the debugger now.
        threadClient.resume();
    },

    detachThread: function()
    {
        Trace.sysout("tabClient.detachThread; " + this.activeThread);

        if (!this.threadAttached)
            return;

        this.threadAttached = false;

        if (this.activeThread)
            this.activeThread.detach(this.onThreadDetached.bind(this));
    },

    onThreadDetached: function(response)
    {
        Trace.sysout("tabClient.onThreadDetached;", response);

        var context = TabWatcher.getContextByWindow(this.window);

        this.dispatch("onThreadDetached", [context]);

        // xxxHonza: this is a hack. ThreadActor doesn't reset the state to "detached"
        // after detach, but to "exited". See ThreadActor.disconnect();
        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=933212
        var threadActor = DebuggerLib.getThreadActor(context.browser);
        threadActor._state = "detached";

        if (context)
            context.activeThread = null;

        this.activeThread = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    executeCallback: function(callback, args)
    {
        if (!callback)
            return;

        args = args || [];

        try
        {
            callback.apply(this, args);
        }
        catch (e)
        {
            TraceError.sysout("tabClient.executeCallback; EXCEPTION" + e, e);
        }
    }
});

// ********************************************************************************************* //
// Registration

return TabClient;

// ********************************************************************************************* //
});
