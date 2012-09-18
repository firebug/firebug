/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/debugger/sourceFile",
    "firebug/debugger/rdp",
    "firebug/debugger/breakpointClient",
    "firebug/debugger/gripCache",
    "firebug/debugger/gripClient",
],
function (Obj, Options, SourceFile, RDP, BreakpointClient, GripCache, GripClient) {

// ********************************************************************************************* //
// Constants and Services

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //

function ThreadClient(connection, actor, debuggerClient)
{
    this.connection = connection;
    this.actor = actor;
    this.debuggerClient = debuggerClient;
    this.frameCache = [];
    this.scriptCache = {};
    this.gripCache = new GripCache(connection);
}

ThreadClient.prototype = Obj.extend(new Firebug.EventSource(),
{
    state: "paused",
    actor: null,
    pauseOnExceptions: false,

    isPaused: function()
    {
        return this.state === "paused";
    },

    assertPaused: function DebuggerClientassertPaused(command)
    {
        if (!this.isPaused())
        {
            FBTrace.sysout("threadClient.assertPaused; EXCEPTION " + this.state, this);
            throw Error(command + " command sent while not paused.");
        }
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
            type: RDP.DebugProtocolTypes.resume,
            resumeLimit: aLimit,
            pauseOnExceptions: this.pauseOnExceptions
        };

        this.connection.request(packet, function(response)
        {
            self.state = "running";

            if (response.error)
            {
                // There was an error resuming, back to paused state.
                self.state = "paused";
            }

            if (onResponse)
                onResponse(response);
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
        var packet = {
            to: this.actor,
            type: RDP.DebugProtocolTypes.interrupt
        };

        var self = this;
        this.connection.request(packet, function(response)
        {
            if (!response.error)
                self.state = "paused";

            if (onResponse)
                onResponse(response);
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
        if (!this.isPaused())
        {
            this.interrupt(function(response)
            {
                if (response.error)
                {
                    // Can't continue if pausing failed.
                    onResponse(response);
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

        var request = {
            to: this.actor,
            type: RDP.DebugProtocolTypes.clientEvaluate,
            frame: aFrame,
            expression: aExpression
        };

        // Remember the callback. It'll be used to pass the result back.
        this.debuggerClient.context.evalInProgress = true;

        var self = this;
        this.connection.request(request, function(response)
        {
            self.debuggerClient.context.evalInProgress = false;

            if (response.error)
            {
                // There was an error resuming, back to paused state.
                self.state = "paused";
            }

            if (onResponse)
                onResponse(response);
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
        var packet = {
            to: this.actor,
            type: RDP.DebugProtocolTypes.detach
        };

        var self = this;
        this.connection.request(packet, function(response)
        {
            if (self.debuggerClient.activeThread === this)
                delete self.activeThread;

            delete self.debuggerClient.threadClients[self.actor];

            if (onResponse)
                onResponse(response);
        });
    },

    /**
     * Request to set a breakpoint in the specified location.
     *
     * @param object location
     *        The source location object where the breakpoint will be set.
     * @param function onResponse
     *        Called with the thread's response.
     */
    setBreakpoint: function DebuggerClient_setBreakpoint(location, onResponse)
    {
        // A helper function that sets the breakpoint.
        var doSetBreakpoint = function _doSetBreakpoint(callback)
        {
            var packet = {
                to: this.actor,
                type: RDP.DebugProtocolTypes.setBreakpoint,
                location: location
            };

            this.connection.request(packet, function(response)
            {
                // Ignoring errors, since the user may be setting a breakpoint in a
                // dead script that will reappear on a page reload.
                if (onResponse)
                {
                    var bpClient = new BreakpointClient(this.connection, response.actor,
                        location);

                    if (callback)
                        callback(onResponse(response, bpClient));
                    else
                        onResponse(response, bpClient);
                }
            }.bind(this));
        }.bind(this);

        // If the debuggee is paused, just set the breakpoint.
        if (this.isPaused())
        {
            doSetBreakpoint();
            return;
        }

        // Otherwise, force a pause in order to set the breakpoint.
        this.interrupt(function(response)
        {
            if (response.error)
            {
                // Can't set the breakpoint if pausing failed.
                onResponse(response);
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
        var packet = { to: this.actor, type: RDP.DebugProtocolTypes.scripts };
        this.connection.request(packet, onResponse);
    },

    /**
     * A cache of source scripts. Clients can observe the scriptsadded and
     * scriptscleared event to keep up to date on changes to this cache,
     * and can fill it using the fillScripts method.
     */
    getCachedScripts: function()
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

        var packet = { to: this.actor, type: RDP.DebugProtocolTypes.frames,
            start: start, count: count ? count : undefined };

        this.connection.request(packet, onResponse);
    },

    /**
     * An array of cached frames. Clients can observe the framesadded and
     * framescleared event to keep up to date on changes to this cache,
     * and can fill it using the fillFrames method.
     */
    getCachedFrames: function()
    {
        return this.frameCache;
    },

    /**
     * true if there are more stack frames available on the server.
     */
    getMoreFrames: function()
    {
        return this.isPaused() && (!this.frameCache || this.frameCache.length == 0
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
        this.getFrames(numFrames, total - numFrames, function(response)
        {
            for each (var frame in response.frames)
                self.frameCache[frame.depth] = frame;

            // If we got as many frames as we asked for, there might be more
            // frames available.
            self.dispatch("framesadded", [self.debuggerClient.context, self.frameCache]);
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
            this.dispatch(this.debuggerClient.context, "framescleared");
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

        var client = new GripClient(this.connection, aGrip);
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
    onThreadState: function DebuggerClient_onThreadState(packet)
    {
        // Ignore thread-state changes if server side evaluation is in progress.
        if (this.debuggerClient.context.evalInProgress)
            return;

        FBTrace.sysout("threadClient.onThreadState; type: " + packet.type, packet);

        this.state = RDP.ThreadStateTypes[packet.type];
        this.clearFrames();
        this.clearPauseGrips();

        this.gripCache.clear();

        if (this.connection.eventsEnabled)
            this.dispatch(packet.type, [this.debuggerClient.context, packet]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Objects

    getObject: function(grip)
    {
        this.assertPaused("getObject");
        return this.gripCache.getObject(grip);
    }
});

// ********************************************************************************************* //
// Registration

return ThreadClient;

// ********************************************************************************************* //
});
