/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/tool",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/remoting/debuggerClient",
],
function (Firebug, FBTrace, Obj, Tool, BreakpointStore, DebuggerClient) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKPOINTTOOL");

// ********************************************************************************************* //
// Breakpoint Tool

function BreakpointTool(context)
{
    this.context = context;
}

/**
 * @object BreakpointTool object is automatically instantiated by the framework for each
 * context. The object represents a proxy to the backend and all communication related
 * to breakpoints should be done through it.
 *
 * {@link BreakpointTool} (one instance per context) is also handling events coming from
 * {@link BreakpointStore} (one instance per Firebug), performs async operation with the
 * server side (using RDP) and forwards results to all registered listeners, which are
 * usually panel objects.
 */
BreakpointTool.prototype = Obj.extend(new Tool(),
/** @lends BreakpointTool */
{
    dispatchName: "breakpointTool",

    // xxxHonza: do we really need this? The underlying framework already has a queue
    // for 'setBreakpoint' packets.
    queue: new Array(),
    setBreakpointInProgress: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    onAttach: function(reload)
    {
        Trace.sysout("breakpointTool.attach; context ID: " + this.context.getId());

        // Listen for 'newScript' events.
        this.context.getTool("source").addListener(this);

        // Listen for {@link BreakpointStore} events to create/remove breakpoints
        // in the related backend (thread actor).
        BreakpointStore.addListener(this);
    },

    onDetach: function()
    {
        Trace.sysout("breakpointTool.detach; context ID: " + this.context.getId());

        this.context.getTool("source").removeListener(this);

        // Thread has been detached, so clean up also all breakpoint clients. They
        // need to be re-created as soon as the thread actor is attached again.
        this.context.breakpointClients = [];

        BreakpointStore.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BreakpointStore Event Listener

    onAddBreakpoint: function(bp)
    {
        Trace.sysout("breakpointTool.onAddBreakpoint; (" + bp.lineNo + ")", bp);

        var self = this;
        this.setBreakpoint(bp.href, bp.lineNo, function(response, bpClient)
        {
            Trace.sysout("breakpointTool.onAddBreakpoint; callback executed", response);

            // Auto-correct shared breakpoint object if necessary and store the original
            // line so, listeners (like e.g. the Script panel) can update the UI.
            var currentLine = bpClient.location.line - 1;
            if (bp.lineNo != currentLine)
            {
                // The breakpoint line is going to be corrected, let's check if there isn't
                // an existing breakpoint at the new line (see issue: 6253). This must be
                // done before the correction.
                var dupBp = BreakpointStore.findBreakpoint(bp.href, bp.lineNo);

                // bpClient deals with 1-based line numbers. Firebug uses 0-based
                // line numbers (indexes). Let's fix the line.
                bp.params.originLineNo = bp.lineNo;
                bp.lineNo = currentLine;

                // If an existing breakpoint has been found we need to remove the newly
                // created one to avoid duplicities (two breakpoints at the same line).
                // Do not fire an event when removing, it's just client side thing.
                if (dupBp)
                {
                    BreakpointStore.removeBreakpointInternal(dupBp.href, dupBp.lineNo);
                    Trace.sysout("breakpointTool.onAddBreakpoint; remove new BP it's a dup");
                }
            }

            // Breakpoint is ready on the server side, let's notify all listeners so,
            // the UI is properly (and asynchronously) updated everywhere.
            self.dispatch("onBreakpointAdded", [self.context, bp]);

            // The info about the original line should not be needed any more.
            delete bp.params.originLineNo;
        });
    },

    onRemoveBreakpoint: function(bp)
    {
        var self = this;
        this.removeBreakpoint(bp.href, bp.lineNo, function(response, bpClient)
        {
            self.dispatch("onBreakpointRemoved", [self.context, bp]);
        });
    },

    onEnableBreakpoint: function(bp)
    {
        var self = this;
        this.enableBreakpoint(bp.href, bp.lineNo, function(response, bpClient)
        {
            self.dispatch("onBreakpointEnabled", [self.context, bp]);
        });
    },

    onDisableBreakpoint: function(bp)
    {
        var self = this;
        this.disableBreakpoint(bp.href, bp.lineNo, function(response, bpClient)
        {
            self.dispatch("onBreakpointDisabled", [self.context, bp]);
        });
    },

    onModifyBreakpoint: function(bp)
    {
        this.dispatch("onBreakpointModified", [this.context, bp]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // SourceTool

    newSource: function(sourceFile)
    {
        var url = sourceFile.getURL();
        var bps = BreakpointStore.getBreakpoints(url);

        // Filter out those breakpoints that have been already set on the backend
        // (i.e. there is a corresponding client object already).
        bps = bps.filter((bp) =>
        {
            return !this.getBreakpointClient(bp.href, bp.lineNo);
        });

        // Bail out if there is nothing to set.
        if (!bps.length)
        {
            Trace.sysout("breakpointTool.newSource; No breakpoints to set");
            return;
        }

        // Filter out disabled breakpoints. These won't be set on the server side
        // (unless the user enables them later).
        // xxxHonza: we shouldn't create server-side breakpoints for normal disabled
        // breakpoints, but not in case there are other breakpoints at the same line.
        /*bps = bps.filter(function(bp, index, array)
        {
            return bp.isEnabled();
        });*/

        Trace.sysout("breakpointTool.newSource; Initialize server side breakpoints: (" +
            bps.length + ") " + url, bps);

        // Set breakpoints on the server side.
        this.setBreakpoints(bps, function()
        {
            // Some breakpoints could have been auto-corrected so, save all now.
            // xxxHonza: what about breakpoints in other contexts using the same URL?
            // Should they be corrected too?

            // xxxHonza: fix me
            // If the thread is paused the callback is called too soon (before all
            // breakpoints are set on the server and response packets received).
            //BreakpointStore.save(url);

            Trace.sysout("breakpointTool.newSource; breakpoints initialized", arguments);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint Backend API

    /**
     * Setting a breakpoint is an asynchronous process that requires communication with
     * the backend. There can be three round-trips with the server:
     * 1) SEND 'interrupt' -> RECEIVED 'paused'
     * 2) SEND 'setBreakpoint' -> RECEIVED 'actor'
     * 3) SEND 'resume' -> RECEIVED 'resumed'
     *
     * If the method is called again in the middle of an existing set-breakpoint-sequence,
     * arguments are pushed in a |queue| and handled after the first process finishes.
     *
     * xxxHonza: the thread doesn't have to be interrupted/resumed if there are
     * other breakpoints waiting in the queue.
     */
    setBreakpoint: function(url, lineNumber, callback)
    {
        // The context needs to be attached to the thread in order to set a breakpoint.
        var thread = this.context.activeThread;
        if (!thread)
        {
            TraceError.sysout("BreakpointTool.setBreakpoint; ERROR Can't set BP, no thread.");
            return;
        }

        Trace.sysout("breakpointTool.setBreakpoint; " + url + " (" + lineNumber + ") " +
            "thread state: " + thread.state);

        // Do not create two server side breakpoints at the same line.
        var bpClient = this.getBreakpointClient(url, lineNumber);
        if (bpClient)
        {
            Trace.sysout("breakpointTool.onAddBreakpoint; BP client already exists", bpClient);

            //xxxHonza: the callback expects a packet, it should not.
            if (callback)
                callback({}, bpClient);
            return;
        }

        var self = this;

        function doSetBreakpoint(callback)
        {
            var location = {
                url: url,
                line: lineNumber + 1
            };

            Trace.sysout("breakpointTool.doSetBreakpoint; (" + lineNumber + ")", location);

            // Send RDP packet to set a breakpoint on the server side. The callback will be
            // executed as soon as we receive a response.
            self.context.activeThread.setBreakpoint(location,
                self.onSetBreakpoint.bind(self, callback));
        }

        // If the debuggee is paused, just set the breakpoint.
        if (thread.paused)
        {
            doSetBreakpoint(callback);
            return;
        }

        // If the previous async-process hasn't finished yet, put arguments in a queue.
        if (this.setBreakpointInProgress)
        {
            Trace.sysout("breakpointTool.setBreakpoint; Setting BP in progress, wait " +
                 url + " (" + lineNumber + ")");

            this.queue.push(arguments);
            return;
        }

        this.setBreakpointInProgress = true;

        // Otherwise, force a pause in order to set the breakpoint.
        // xxxHonza: this sometimes generates 'alreadyPaused' packet, fix me.
        // Or maybe the interrupt call in setBreakpoints. You need a page with two
        // loaded URLs with breakpoints
        thread.interrupt(function(response)
        {
            if (response.error)
            {
                // Can't set the breakpoint if pausing failed.
                callback(response);
                return;
            }

            // Set the breakpoint
            doSetBreakpoint(function(response, bpClient)
            {
                // Wait for resume
                thread.resume(function(response)
                {
                    self.setBreakpointInProgress = false;

                    callback(response, bpClient);

                    // Set breakpoints waiting in the queue.
                    if (self.queue.length > 0)
                        self.setBreakpoint.apply(self, self.queue.shift());
                });
            });
        });
    },

    /**
     * Executed when a breakpoint is set on the backend and confirmation packet
     * has been received.
     */
    onSetBreakpoint: function(callback, response, bpClient)
    {
        var actualLocation = response.actualLocation;

        Trace.sysout("breakpointTool.onSetBreakpoint; " + bpClient.location.url + " (" +
            bpClient.location.line + ")", bpClient);

        // Note that both actualLocation and bpClient.location deal with 1-based
        // line numbers.
        if (actualLocation && actualLocation.line != bpClient.location.line)
        {
            // To be found when it needs removing.
            bpClient.location.line = actualLocation.line;
        }

        // Store breakpoint clients so, we can use the actors to remove breakpoints.
        // xxxFarshid: Shouldn't we save bpClient object only if there is no error?
        // xxxHonza: yes, we probably should.
        // xxxHonza: we also need an error logging
        if (!this.context.breakpointClients)
            this.context.breakpointClients = [];

        // Check if the breakpoint-client object already exist. The line could
        // have been corrected on the server side and there can already be a breakpoint
        // on the new line.
        if (bpClient.actor && !this.breakpointActorExists(bpClient))
            this.context.breakpointClients.push(bpClient);

        if (callback)
            callback(response, bpClient);

        this.setBreakpointInProgress = false;
    },

    /**
     * Creates breakpoint actors on the server side and {@link BreakpointClient} objects
     * on the client side. The client objects are stored within {@link TabContext}.
     *
     * @param arr {Array} List of breakpoints to be created on the server side
     * @param cb {Function} Optional callback that is executed as soon as all breakpoints
     * are created on the server side and the current thread resumed again.
     */
    setBreakpoints: function(arr, cb)
    {
        var self = this;

        // Bail out if there is nothing to set.
        if (!arr.length)
            return;

        var thread = this.context.activeThread;
        if (!thread)
        {
            TraceError.sysout("BreakpointTool.setBreakpoints; Can't set breakpoints " +
                "if there is no active thread");
            return;
        }

        Trace.sysout("breakpointTool.setBreakpoints; " + arr.length +
            ", thread state: " + thread.state, arr);

        var doSetBreakpoints = function _doSetBreakpoints(callback)
        {
            Trace.sysout("breakpointTool.doSetBreakpoints; ", arr);

            // Iterate all breakpoints in the given array and set them step by step.
            // The thread is paused at this point. The following loop generates a set of
            // 'setBreakpoint' packets that are put in an internal queue (in the underlying
            // RDP framework) and handled step by step, i.e. the next 'setBreakpoint' packet
            // is sent as soon as a response for the previous one is received.
            for (var i=0; i<arr.length; i++)
                self.onAddBreakpoint(arr[i]);

            if (callback)
                callback();
        };

        // If the thread is currently paused, go to set all the breakpoints.
        if (thread.paused)
        {
            // xxxHonza: the callback should be called when the last breakpoint
            // is set on the backend, fix me.
            doSetBreakpoints(cb);
            return;
        }

        // ... otherwise we need to interrupt the thread first.
        thread.interrupt(function(response)
        {
            if (response.error)
            {
                TraceError.sysout("BreakpointTool.setBreakpoints; Can't set breakpoints: " +
                    response.error);
                return;
            }

            // When the thread is interrupted, we can set all the breakpoints.
            doSetBreakpoints(function()
            {
                Trace.sysout("breakpointTool.doSetBreakpoints; done", arguments);

                // At this point, all 'setBreakpoint' packets have been generated (the first
                // on already sent) and they are waiting in a queue. The resume packet will
                // be received as soon as the last response for 'setBreakpoint' is received.
                self.context.getTool("debugger").resume(cb);
            });
        });
    },

    removeBreakpoint: function(url, lineNumber, callback)
    {
        if (!this.context.activeThread)
        {
            TraceError.sysout("breakpointTool.removeBreakpoint; Can't remove breakpoints.");
            return;
        }

        // Do note remove server-side breakpoint if there are still some client side
        // breakpoint at the line.
        if (BreakpointStore.hasAnyBreakpoint(url, lineNumber))
        {
            // xxxHonza: the callback expects a packet as an argument, it should not.
            if (callback)
                callback({});
            return;
        }

        // We need to get the breakpoint client object for this context. The client
        // knows how to remove the breakpoint on the server side.
        var client = this.removeBreakpointClient(url, lineNumber);
        if (client)
        {
            client.remove(callback);
        }
        else
        {
            TraceError.sysout("breakpointTool.removeBreakpoint; ERROR removing " +
                "non existing breakpoint. " + url + ", " + lineNumber);
        }
    },

    getBreakpointClient: function(url, lineNumber)
    {
        var clients = this.context.breakpointClients;
        if (!clients)
            return;

        for (var i=0; i<clients.length; i++)
        {
            var client = clients[i];
            var loc = client.location;
            if (loc.url == url && (loc.line - 1) == lineNumber)
                return client;
        }
    },

    removeBreakpointClient: function(url, lineNumber)
    {
        var clients = this.context.breakpointClients;
        if (!clients)
            return;

        for (var i=0; i<clients.length; i++)
        {
            var client = clients[i];
            var loc = client.location;
            if (loc.url == url && (loc.line - 1) == lineNumber)
            {
                clients.splice(i, 1);
                return client;
            }
        }
    },

    breakpointActorExists: function(bpClient)
    {
        var clients = this.context.breakpointClients;
        if (!clients)
            return false;

        var client;
        for (var i=0, len = clients.length; i < len; i++)
        {
            client = clients[i];
            if (client.actor === bpClient.actor)
                return true;
        }

        return false;
    },

    enableBreakpoint: function(url, lineNumber, callback)
    {
        // Enable breakpoint means adding it to the server side.
        this.setBreakpoint(url, lineNumber, callback);
    },

    disableBreakpoint: function(url, lineNumber, callback)
    {
        // Disable breakpoint means removing it from the server side.
        this.removeBreakpoint(url, lineNumber, callback);
    },

    isBreakpointDisabled: function(url, lineNumber)
    {
        //return JSDebugger.fbs.isBreakpointDisabled(url, lineNumber);
    },

    getBreakpointCondition: function(url, lineNumber)
    {
        //return JSDebugger.fbs.getBreakpointCondition(url, lineNumber);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool("breakpoint", BreakpointTool);

return BreakpointTool;

// ********************************************************************************************* //
});
