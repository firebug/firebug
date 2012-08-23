/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/debugger/sourceFile",
],
function (Obj, Options, SourceFile) {

// ********************************************************************************************* //
// Constants and Services

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

/**
 * Set of debug protocol request types that specify the protocol request being
 * sent to the server.
 */
const DebugProtocolTypes =
{
    "assign": "assign",
    "attach": "attach",
    "clientEvaluate": "clientEvaluate",
    "delete": "delete",
    "detach": "detach",
    "frames": "frames",
    "interrupt": "interrupt",
    "nameAndParameters": "nameAndParameters",
    "ownPropertyNames": "ownPropertyNames",
    "property": "property",
    "prototype": "prototype",
    "prototypeAndProperties": "prototypeAndProperties",
    "resume": "resume",
    "scripts": "scripts",
    "setBreakpoint": "setBreakpoint"
};

// ********************************************************************************************* //
// Debugger Client

function JSD2DebuggerClient(context, connection)
{
    this.context = context;
    this.connection = connection;

    this.threadClients = {};
}

JSD2DebuggerClient.prototype = Obj.extend(Object,
{
    dispatchName: "JSD2DebuggerClient",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function(context, doc)
    {
    },

    destroy: function(state)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    attach: function(callback)
    {
        this.connection.addListener("tabNavigated", this.onTabNavigated);
        this.connection.addListener("tabDetached", this.onTabDetached);

        var self = this;
        this.connection.listTabs(function(response)
        {
            var tab = response.tabs[response.selected];
            self.startDebugging(tab);
        });
    },

    detach: function()
    {
        
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Calbacks

    onTabNavigated: function()
    {
        FBTrace.sysout("debuggerClient.onTabNavigated;");
    },

    onTabDetached: function()
    {
        FBTrace.sysout("debuggerClient.onTabDetached;");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    startDebugging: function(tabGrip)
    {
        this.connection.attachTab(tabGrip.actor, function(response, tabActor)
        {
            if (!tabActor)
            {
                Cu.reportError("No tab client found!");
                return;
            }

            this.tabActor = tabActor;

            this.attachThread(response.threadActor, function(response, threadClient)
            {
                if (!threadClient)
                {
                    Cu.reportError("Couldn't attach to thread: " + response.error);
                    return;
                }

                this.activeThread = threadClient;

                this.scripts = new SourceScripts(this.context, this.connection,
                    this.activeThread);

                // Connect script manager and resume remote thread.
                this.scripts.connect();
                this.activeThread.resume();

                FBTrace.sysout("debuggerClient.startDebugging;");

            }.bind(this));
        }.bind(this));
    },

    attachThread: function DebuggerClient_attachThread(threadActor, onResponse)
    {
        var packet = {
            to: threadActor,
            type: "attach"
        };

        var self = this;
        this.connection.request(packet, function(response)
        {
            if (!response.error)
            {
                var threadClient = new ThreadClient(self.connection, threadActor);
                self.threadClients[threadActor] = threadClient;
                self.activeThread = threadClient;
            }
            onResponse(response, threadClient);
        });
    },

});

// ********************************************************************************************* //

function ThreadClient(client, actor)
{
    this.client = client;
    this.actor = actor;
    this.frameCache = [];
    this.scriptCache = {};
}

ThreadClient.prototype = Obj.extend(new Firebug.EventSource(),
{
    state: "paused",
    get paused() { return this.state === "paused"; },

    actor: null,
    pauseOnExceptions: false,

    assertPaused: function DebuggerClientassertPaused(command)
    {
        if (!this.paused)
            throw Error(command + " command sent while not paused.");
    },

    /**
     * Resume a paused thread. If the optional aLimit parameter is present, then
     * the thread will also pause when that limit is reached.
     *
     * @param function onResponse
     *        Called with the response packet.
     * @param [optional] object aLimit
     *        An object with a type property set to the appropriate limit (next,
     *        step, or finish) per the remote debugging protocol specification.
     */
    resume: function DebuggerClient_resume(onResponse, aLimit)
    {
        this.assertPaused("resume");

        // Put the client in a tentative "resuming" state so we can prevent
        // further requests that should only be sent in the paused state.
        this.state = "resuming";

        var self = this;
        var packet = {
            to: this.actor,
            type: DebugProtocolTypes.resume,
            resumeLimit: aLimit,
            pauseOnExceptions: this.pauseOnExceptions
        };

        this.client.request(packet, function(aResponse)
        {
            if (aResponse.error) {

                // There was an error resuming, back to paused state.
                self.state = "paused";
            }

            if (onResponse)
                onResponse(aResponse);
        });
    },

    /**
     * Step over a function call.
     *
     * @param function onResponse
     *        Called with the response packet.
     */
    stepOver: function DebuggerClient_stepOver(onResponse)
    {
        this.resume(onResponse, { type: "next" });
    },

    /**
     * Step into a function call.
     *
     * @param function onResponse
     *        Called with the response packet.
     */
    stepIn: function DebuggerClient_stepIn(onResponse)
    {
        this.resume(onResponse, { type: "step" });
    },

    /**
     * Step out of a function call.
     *
     * @param function onResponse
     *        Called with the response packet.
     */
    stepOut: function DebuggerClient_stepOut(onResponse)
    {
        this.resume(onResponse, { type: "finish" });
    },

    /**
     * Interrupt a running thread.
     *
     * @param function onResponse
     *        Called with the response packet.
     */
    interrupt: function DebuggerClient_interrupt(onResponse)
    {
        var packet = { to: this.actor, type: DebugProtocolTypes.interrupt };
        this.client.request(packet, function(aResponse)
        {
            if (onResponse)
                onResponse(aResponse);
        });
    },

    /**
     * Enable or disable pausing when an exception is thrown.
     *
     * @param boolean aFlag
     *        Enables pausing if true, disables otherwise.
     * @param function onResponse
     *        Called with the response packet.
     */
    pauseOnExceptions: function DebuggerClient_pauseOnExceptions(aFlag, onResponse)
    {
        this.pauseOnExceptions = aFlag;

        // If the debuggee is paused, the value of the flag will be communicated in
        // the next resumption. Otherwise we have to force a pause in order to send
        // the flag.
        if (!this.paused)
        {
            this.interrupt(function(aResponse)
            {
                if (aResponse.error)
                {
                    // Can't continue if pausing failed.
                    onResponse(aResponse);
                    return;
                }
                this.resume(onResponse);
            }.bind(this));
        }
    },

    /**
     * Send a clientEvaluate packet to the debuggee. Response
     * will be a resume packet.
     *
     * @param string aFrame
     *        The actor ID of the frame where the evaluation should take place.
     * @param string aExpression
     *        The expression that will be evaluated in the scope of the frame
     *        above.
     * @param function onResponse
     *        Called with the response packet.
     */
    eval: function DebuggerClient_eval(aFrame, aExpression, onResponse)
    {
        this.assertPaused("eval");

        // Put the client in a tentative "resuming" state so we can prevent
        // further requests that should only be sent in the paused state.
        this.state = "resuming";

        var self = this;
        var request = { to: this.actor, type: DebugProtocolTypes.clientEvaluate,
            frame: aFrame, expression: aExpression };

        this.client.request(request, function(aResponse)
        {
            if (aResponse.error)
            {
                // There was an error resuming, back to paused state.
                self.state = "paused";
            }

            if (onResponse)
                onResponse(aResponse);
        });
    },

    /**
     * Detach from the thread actor.
     *
     * @param function onResponse
     *        Called with the response packet.
     */
    detach: function DebuggerClient_detach(onResponse)
    {
        var self = this;
        var packet = { to: this.actor, type: DebugProtocolTypes.detach };

        this.client.request(packet, function(aResponse)
        {
            if (self.activeThread === self._client._threadClients[self._actor])
                delete self.activeThread;

            delete self._client._threadClients[self._actor];

            if (onResponse)
                onResponse(aResponse);
        });
    },

    /**
     * Request to set a breakpoint in the specified location.
     *
     * @param object aLocation
     *        The source location object where the breakpoint will be set.
     * @param function onResponse
     *        Called with the thread's response.
     */
    setBreakpoint: function DebuggerClient_setBreakpoint(aLocation, onResponse)
    {
        // A helper function that sets the breakpoint.
        var doSetBreakpoint = function _doSetBreakpoint(aCallback)
        {
            var packet = { to: this.actor, type: DebugProtocolTypes.setBreakpoint,
                location: aLocation };

            this.client.request(packet, function (aResponse)
            {
                // Ignoring errors, since the user may be setting a breakpoint in a
                // dead script that will reappear on a page reload.
                if (onResponse)
                {
                    var bpClient = new BreakpointClient(this.client, aResponse.actor,
                        aLocation);

                    if (aCallback)
                        aCallback(onResponse(aResponse, bpClient));
                    else
                        onResponse(aResponse, bpClient);
                }
            }.bind(this));
        }.bind(this);

        // If the debuggee is paused, just set the breakpoint.
        if (this.paused)
        {
            doSetBreakpoint();
            return;
        }

        // Otherwise, force a pause in order to set the breakpoint.
        this.interrupt(function(aResponse)
        {
            if (aResponse.error)
            {
                // Can't set the breakpoint if pausing failed.
                onResponse(aResponse);
                return;
            }

            doSetBreakpoint(this.resume.bind(this));
        }.bind(this));
  },

    /**
     * Request the loaded scripts for the current thread.
     *
     * @param onResponse integer
     *        Called with the thread's response.
     */
    getScripts: function DebuggerClient_getScripts(onResponse)
    {
        var packet = { to: this.actor, type: DebugProtocolTypes.scripts };
        this.client.request(packet, onResponse);
    },

    /**
     * A cache of source scripts. Clients can observe the scriptsadded and
     * scriptscleared event to keep up to date on changes to this cache,
     * and can fill it using the fillScripts method.
     */
    get cachedScripts()
    {
        return this.scriptCache;
    },

    /**
     * Ensure that source scripts have been loaded in the
     * ThreadClient's source script cache. A scriptsadded event will be
     * sent when the source script cache is updated.
     *
     * @returns true if a scriptsadded notification should be expected.
     */
    fillScripts: function DebuggerClient_fillScripts()
    {
        var self = this;
        this.getScripts(function(response)
        {
            for each (var script in response.scripts)
            {
                if (!self.scriptCache[script.url])
                    self.scriptCache[script.url] = script;
            }

            // If the cache was modified, notify listeners.
            if (response.scripts && response.scripts.length)
                self.dispatch("onScriptsAdded", [self.scriptCache]);
        });

        return true;
    },

    /**
     * Clear the thread's source script cache. A scriptscleared event
     * will be sent.
     */
    clearScripts: function DebuggerClient_clearScripts()
    {
        if (Object.keys(this.scriptCache).length > 0)
        {
            this.scriptCache = {}
            this.dispatch("scriptsCleared");
        }
    },

    /**
     * Request frames from the callstack for the current thread.
     *
     * @param start integer
     *        The number of the youngest stack frame to return (the youngest
     *        frame is 0).
     * @param count integer
     *        The maximum number of frames to return, or null to return all
     *        frames.
     * @param onResponse function
     *        Called with the thread's response.
     */
    getFrames: function DebuggerClient_getFrames(start, count, onResponse)
    {
        this.assertPaused("frames");

        var packet = { to: this.actor, type: DebugProtocolTypes.frames,
            start: start, count: count ? count : undefined };

        this.client.request(packet, onResponse);
    },

    /**
     * An array of cached frames. Clients can observe the framesadded and
     * framescleared event to keep up to date on changes to this cache,
     * and can fill it using the fillFrames method.
     */
    get cachedFrames()
    {
        return this.frameCache;
    },

    /**
     * true if there are more stack frames available on the server.
     */
    get moreFrames()
    {
        return this.paused && (!this.frameCache || this.frameCache.length == 0
          || !this.frameCache[this.frameCache.length - 1].oldest);
    },

    /**
     * Ensure that at least total stack frames have been loaded in the
     * ThreadClient's stack frame cache. A framesadded event will be
     * sent when the stack frame cache is updated.
     *
     * @param total number
     *        The minimum number of stack frames to be included.
     *
     * @returns true if a framesadded notification should be expected.
     */
    fillFrames: function DebuggerClient_fillFrames(total)
    {
        this.assertPaused("fillFrames");

        if (this.frameCache.length >= total)
            return false;

        var numFrames = this.frameCache.length;

        var self = this;
        this.getFrames(numFrames, total - numFrames, function(aResponse)
        {
            for each (var frame in aResponse.frames)
                self.frameCache[frame.depth] = frame;

            // If we got as many frames as we asked for, there might be more
            // frames available.
            self.notify("framesadded");
        });

        return true;
    },

    /**
     * Clear the thread's stack frame cache. A framescleared event
     * will be sent.
     */
    clearFrames: function DebuggerClient_clearFrames()
    {
        if (this.frameCache.length > 0)
        {
            this.frameCache = [];
            this.notify("framescleared");
        }
    },

    /**
     * Return a GripClient object for the given object grip.
     *
     * @param aGrip object
     *        A pause-lifetime object grip returned by the protocol.
     */
    pauseGrip: function DebuggerClient_pauseGrip(aGrip)
    {
        if (!this.pauseGrips)
            this.pauseGrips = {};

        if (aGrip.actor in this.pauseGrips)
            return this.pauseGrips[aGrip.actor];

        var client = new GripClient(this.client, aGrip);
        this.pauseGrips[aGrip.actor] = client;
        return client;
    },

    /**
     * Invalidate pause-lifetime grip clients and clear the list of
     * current grip clients.
     */
    clearPauseGrips: function DebuggerClient_clearPauseGrips(aPacket)
    {
        for each (var grip in this.pauseGrips)
            grip.valid = false;
        this.pauseGrips = null;
    },

    /**
     * Handle thread state change by doing necessary cleanup and notifying all
     * registered listeners.
     */
    onThreadState: function DebuggerClient_onThreadState(aPacket)
    {
        this.state = ThreadStateTypes[aPacket.type];
        this.clearFrames();
        this.clearPauseGrips();
        this.client.eventsEnabled && this.notify(aPacket.type, aPacket);
    },
});

// ********************************************************************************************* //

/**
 * Keeps the source script list up-to-date, using the thread client's
 * source script cache.
 */
function SourceScripts(context, client, thread)
{
    this.context = context;
    this.client = client;
    this.thread = thread;
}

SourceScripts.prototype =
{
    connect: function (callback)
    {
        this.thread.addListener(this);

        // Retrieve the list of scripts known to the server from before the client
        // was ready to handle new script notifications.
        this.thread.fillScripts();
    },

    disconnect: function()
    {
        
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onNewScript: function(notification, packet)
    {
        FBTrace.sysout("SourceScripts.onNewScript; " + notification, packet);
    },

    onScriptsAdded: function(scriptCache)
    {
        FBTrace.sysout("SourceScripts.onScriptsAdded; ", scriptCache);

        for (var p in scriptCache)
        {
            var script = scriptCache[p];
            var sourceFile = new SourceFile(script.url, script.startLine, script.lineCount);
            this.watchSourceFile(sourceFile);
        }
    },

    onScriptsCleared: function()
    {
        
    },

    watchSourceFile: function(sourceFile)
    {
        // store in the context and notify listeners
        this.context.addSourceFile(sourceFile);

        // Update the Script panel, this script could have been loaded asynchronously
        // and perhaps is the only one that should be displayed (otherwise the panel
        // would show: No Javascript on this page). See issue 4932
        var panel = this.context.getPanel("jsd2script", true);
        if (panel)
            panel.context.invalidatePanels("jsd2script");
    },
};

// ********************************************************************************************* //
// Registration

return JSD2DebuggerClient;

// ********************************************************************************************* //
});
