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

"use strict";

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // Set to true if a browser tab is attached.
    tabAttached: false,

    // Set to true if tab attach process is in progress
    attachTabInProgress: true,

    // Set to true if backend thread is attached.
    threadAttached: false,

    // Set to true if detach sequence is in progress.
    detachInProgress: false,

    // Reference to the built-in {@link TabClient} object associated with
    // the wrapped browser tab.
    tabClient: null,

    // Reference to the built-in {@link ThreadClient} object, set after thread attach
    // process has been done.
    activeThread: null,

    // Actor ID of the attached thread client.
    threadActor: null,

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

        // We can't initiate the attach process when detaching is currently in progress.
        if (this.detachInProgress)
        {
            TraceError.sysout("tabClient.attach; ERROR Can't attach, detaching in progress!");
            return;
        }

        this.attachCallback = callback;

        // Attaching Firebug to the current tab is now in progress.
        // The 'this.tabAttached' flag will be set to true as soon as the entire
        // process is done.
        this.attachTabInProgress = true;

        // Step I. get list of all available tabs (happens asynchronously).
        this.client.listTabs(this.onListTabs.bind(this));
    },

    detach: function(callback)
    {
        Trace.sysout("tabClient.detach; " + getWinLocation(this.window));

        this.detachCallback = callback;
        this.tabAttached = false;
        this.attachTabInProgress = false;

        // We started the detach process.
        this.detachInProgress = true;

        this.detachTab();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attach TabActor

    onListTabs: function(response)
    {
        if (response.error)
        {
            TraceError.sysout("tabClient.onListTabs; ERROR " + response.error + ": " +
                response.message, response);
        }

        // If the tab has been detached after 'this.listTabs' has been sent ignore
        // the rest of attach sequence.
        if (!this.attachTabInProgress)
            return;

        // The response contains list of all tab and global actors registered
        // on the server side. We need to cache it since these IDs will be
        // needed later (for communication to these actors).
        // See also getActorId method.
        this.listTabsResponse = response;

        // Attach to the currently selected tab.
        // xxxHonza: The tab we want to attach to doesn't have to be the currently
        // selected one. This might happen e.g. if an existing tab is moved into
        // a new window. This action activates the next tab in the original window
        // (causing new Firebug context to be created), but the selected tab is the
        // one moved in the new window (see also issue 6856).
        //var tabGrip = response.tabs[response.selected];
        //this.attachTab(tabGrip.actor);

        // ... so we need to find the proper tab-actor by direct access
        // to the backend -> fix me (the 'tabListChanged' packet might be utilized
        // causing to re-request tab-list if received in the middle).
        var tabActor = DebuggerLib.getTabActor(this.browser);
        if (!tabActor)
        {
            Trace.sysout("tabClient.onListTab; no tab actor, tab closing?", response);
            return;
        }

        this.attachTab(tabActor.actorID);
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

        // Just like in 'this.onListTabs', if the tab has been detached in the middle
        // of the attach process, ignore the rest of the sequence.
        if (!this.attachTabInProgress)
        {
            TraceError.sysout("tabClient.onTabAttached; ERROR: tab already detached!");
            return;
        }

        // No client object passed in, that's a weird problem.
        if (!tabClient)
        {
            TraceError.sysout("tabClient.onTabAttached; ERROR: No tab client! " +
                response.error, response);
            return;
        }

        this.threadActor = response.threadActor;
        this.tabClient = tabClient;

        // The attach process is done, update flags.
        this.attachTabInProgress = false;
        this.tabAttached = true;

        // Execute attach callback if any is provided.
        this.executeCallback(this.attachCallback, [tabClient, this.threadActor]);
        this.attachCallback = null

        var browser = Firefox.getBrowserForWindow(this.window);
        this.dispatch("onTabAttached", [browser]);

        // If 'attachThread' has been executed in the middle of the tab-attach process
        // let's start the thread-attach process now.
        if (this.autoAttachThread)
        {
            this.autoAttachThread = false;

            if (!this.threadAttached)
                this.attachThread();
        }
    },

    detachTab: function()
    {
        Trace.sysout("tabClient.detachTab;");

        if (this.tabClient)
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
        this.detachInProgress = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attach ThreadActor

    attachThread: function()
    {
        Trace.sysout("tabClient.attachThread; " + getWinLocation(this.window));

        // If the tab-attach sequence is currently in progress we need to wait
        // and attach the tread as soon as it's done.
        if (this.attachTabInProgress)
        {
            Trace.sysout("tabClient.attachThread; Will attch thread as soon as tab is attached.");

            this.autoAttachThread = true;
            return;
        }

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

        // xxxHonza: the ThreadActor's |global| might have been changed (see issue 7029)
        // referencing an embedded frame. So, make sure it's set to the top level
        // window again. This should be removed as soon as the platform if fixed:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=962632
        var threadActorObj = DebuggerLib.getThreadActor(this.browser);
        threadActorObj.global = this.window.wrappedJSObject;

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

        // This flag is set when "onThreadAttached" is sent for the first time.
        this.onThreadAttachedEventSent = false;

        // Update existing context. Note that the context that caused the attach
        // can be already destroyed (e.g. if page refresh happened soon after load)
        // and new one created. This isn't a problem since the threadActor is created
        // for the tab and shares its life time. So, every context created within this
        // tab will use the same tabActor anyway.
        var context = TabWatcher.getContextByWindow(this.window);
        if (context)
        {
            context.activeThread = threadClient;

            // Dispatch event to all listeners only if the context is already
            // available. Otherwise, it'll be dispatched as soon as the context
            // is initialized, which happens in {@link DebuggerClient.initContext}
            this.dispatch("onThreadAttached", [context]);

            // Further "onThreadAttached" events sent when the page is reloaded
            // will use |reload| flag set to true, see {@link DebuggerClient.initContext}
            this.onThreadAttachedEventSent = true;
        }

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
