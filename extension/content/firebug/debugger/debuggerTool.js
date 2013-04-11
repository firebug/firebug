/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/lib/tool",
    "arch/compilationunit",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/remoting/debuggerClientModule",
    "firebug/debugger/clients/clientCache",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/lib/options",
],
function (Obj, Firebug, FBTrace, Arr, Tool, CompilationUnit, StackFrame, StackTrace,
    DebuggerClientModule, ClientCache, SourceFile, BreakpointStore, Options) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_DEBUGGERTOOL");

// ********************************************************************************************* //
// Debugger Tool

function DebuggerTool(context)
{
    this.context = context;
}

/**
 * @object
 */
DebuggerTool.prototype = Obj.extend(new Firebug.EventSource(),
/** @lends DebuggerTool */
{
    dispatchName: "DebuggerTool",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    attach: function()
    {
        Trace.sysout("debuggerTool.initialize; context ID: " + this.context.getId());

        this.attachListeners(this.context);

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles(this.context);

        // Initialize break on exception flag.
        this.breakOnExceptions(this.context, Options.get("breakOnExceptions"));

        BreakpointStore.addListener(this);
    },

    detach: function()
    {
        Trace.sysout("debuggerTool.destroyContext; context ID: " + this.context.getId());

        this.detachListeners(this.context);

        BreakpointStore.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listeners

    attachListeners: function(context)
    {
        // Bail out if listeners are already attached.
        if (context._onPause)
            return;

        // This is the place where we bind all listeners to the current
        // context so, it's available inside the methods.
        context._onPause = this.paused.bind(this, context);
        context._onDetached = this.detached.bind(this, context);
        context._onResumed = this.resumed.bind(this, context);
        context._onFramesAdded = this.framesadded.bind(this, context);
        context._onFramesCleared = this.framescleared.bind(this, context);
        context._onNewScript = this.newScript.bind(this, context);

        // Add all listeners
        context.activeThread.addListener("paused", context._onPause);
        context.activeThread.addListener("detached", context._onDetached);
        context.activeThread.addListener("resumed", context._onResumed);

        // These events are used to sync with ThreadClient's stack frame cache.
        context.activeThread.addListener("framesadded", context._onFramesAdded);
        context.activeThread.addListener("framescleared", context._onFramesCleared);

        DebuggerClientModule.client.addListener("newScript", context._onNewScript);
    },

    detachListeners: function(context)
    {
        // Bail out if listeners are already dettached.
        if (!context._onPause)
            return;

        // Remove all listeners from the current ThreadClient
        context.activeThread.removeListener("paused", context._onPause);
        context.activeThread.removeListener("detached", context._onDetached);
        context.activeThread.removeListener("resumed", context._onResumed);
        context.activeThread.removeListener("framesadded", context._onFramesAdded);
        context.activeThread.removeListener("framescleared", context._onFramesCleared);

        DebuggerClientModule.client.removeListener("newScript", context._onNewScript);

        context._onPause = null;
        context._onDetached = null;
        context._onResumed = null;
        context._onFramesAdded = null;
        context._onFramesCleared = null;
        context._onNewScript = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Script Sources

    updateScriptFiles: function(context)
    {
        var self = this;
        context.activeThread.getScripts(function(response)
        {
            var scripts = response.scripts;
            for (var i=0; i<scripts.length; i++)
                self.addScript(context, scripts[i]);
        });
    },

    newScript: function(context, type, response)
    {
        this.addScript(context, response);
    },

    addScript: function(context, script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // create as the user is evaluating expressions in the watch window.
        if (script.url == "debugger eval code")
            return;

        var s = script;

        if (!context.sourceFileMap)
        {
            TraceError.sysout("debuggerTool.addScript; ERROR Source File Map is NULL", script);
            return;
        }

        // xxxHonza: Ignore inner script for now
        if (context.sourceFileMap[s.url])
            return;

        // Create a source file and append it into the context.
        var sourceFile = new SourceFile(s.source, s.url, s.startLine, s.lineCount);
        context.addSourceFile(sourceFile);

        // Notify listeners (e.g. the Script panel) to updated itself. It can happen
        // that the Script panel has been empty until now and need to display a script.
        this.dispatch("newScript", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(context, event, packet)
    {
        var type = packet.why.type;
        var where = packet.frame ? packet.frame.where : {};
        Trace.sysout("debuggerTool.paused; " + type + ", " + where.url +
            " (" + where.line + "), context ID: " + context.getId(), packet);

        var ignoreTypes = {
            "interrupted": 1,
        };

        if (ignoreTypes[type])
            return;

        context.clientCache.clear();

        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=829028
        // Avoid double-break at the same line (e.g. breakpoint + step-over)

        // Create stack of frames and initialize context.
        // context.stoppedFrame: the frame we stopped in, don't change this elsewhere.
        // context.currentFrame: the frame we show to user, depends on selection.
        // xxxHonza: if there are any watch expressions in the Watch panel, the
        // currentFrame is reset by 'clientEvaluated' packet (round trip). The current frame
        // selection should be remembered (as an index?) and updated when the 'clientEvaluated'
        // is received.
        var frame = StackFrame.buildStackFrame(packet.frame, context);
        context.stoppedFrame = frame;
        context.currentFrame = frame;
        context.stopped = true;
        context.currentPauseActor = packet.actor;

        // Notify listeners, about debugger pause event.
        this.dispatch("onDebuggerPaused", [context, event, packet])

        // Helper resume function
        function doResume(tool)
        {
            // Get resume limit type from the context (doesn't have to be set).
            var resumeLimit = context.resumeLimit;
            delete context.resumeLimit;

            // Resume debugger
            return tool.resume(context, null, resumeLimit);
        }

        // Send event allowing immediate resume. If at least one listener returns
        // true, the debugger will resume.
        if (this.dispatch2("shouldResumeDebugger", [context, event, packet]))
        {
            Trace.sysout("debuggerTool.paused; Listeners want to resume the debugger.");
            return doResume(this);
        }

        // Send event asking whether the debugger should really break. If at least
        // one listeners returns true, the debugger just conntinues with pause.
        if (!this.dispatch2("shouldBreakDebugger", [context, event, packet]))
        {
            Trace.sysout("debuggerTool.paused; Listeners don't want to break the debugger.");
            return doResume(this);
        }

        // Asynchronously initializes ThreadClient's stack frame cache. If you want to
        // sync with the cache handle 'framesadded' and 'framescleared' events.
        // This is done after we know that the debugger is going to pause now.
        context.activeThread.fillFrames(50);

        // Panels are created when first used by the user, but in this case we need to break
        // JS execution and show it in the Script panel immediatelly so, it needs to exist before
        // firing 'onStartDebugging' event.
        context.getPanel("script");

        // Notify listeners. E.g. the {@ScriptPanel} panel needs to update its UI.
        this.dispatch("onStartDebugging", [context, event, packet]);

        // Execute registered 'clientEvaluated' callback.
        // This must be done after "onStartDebugging" is dispatched to the Script panel, which
        // is updating selection of the Watch panel and could potentially start Watch expr
        // evaluation again (since evalInProgress would be false i.e. done).
        // xxxHonza: still bad architecture, the eval() method should have a simple callback
        // even if the action is spreaded over resume-pause roundtrip.
        if (type == "clientEvaluated" && context.evalCallback)
        {
            context.evalCallback(context, event, packet);
            context.evalCallback = null;
        }
    },

    resumed: function(context, event, packet)
    {
        Trace.sysout("debuggerTool.resumed; ", arguments);

        context.clientCache.clear();

        context.stopped = false;
        context.stoppedFrame = null;
        context.currentFrame = null;
        context.currentTrace = null;

        this.dispatch("onStopDebugging", [context, event, packet]);
    },

    detached: function(context)
    {
        Trace.sysout("debuggerTool.detached; ", arguments);

        context.clientCache.clear();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Frames

    framesadded: function(context)
    {
        // Get frames from ThreadClient's stack-frame cache and build stack trace object,
        // which is stored in the context.
        var frames = context.activeThread.cachedFrames;
        Trace.sysout("debuggerTool.framesadded; frames: ", frames);

        context.currentTrace = StackTrace.buildStackTrace(context, frames);

        // Now notify all listeners, for example the {@CallstackPanel} panel to sync the UI.
        this.dispatch("framesadded", [context.currentTrace]);
    },

    framescleared: function(context)
    {
        Trace.sysout("debuggerTool.framescleared; ", arguments);

        context.currentTrace = null;

        this.dispatch("framescleared");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BreakpointStore Event Listener

    // Debugger Tools is handling events coming from the BreakpointStore performing async
    // operation with the server side and forwarding results to all registered listeners
    // (usually panel objects)

    onAddBreakpoint: function(bp)
    {
        var self = this;
        this.setBreakpoint(this.context, bp.href, bp.lineNo, function(response, bpClient)
        {
            // Autocorrect shared breakpoint object if necessary and store the original
            // line so, listeners (like e.g. the Script panel) can update the UI.
            var currentLine = bpClient.location.line - 1
            if (bp.lineNo != currentLine)
            {
                // bpClient deals with 1-based line numbers. Firebug uses 0-based
                // line numbers (indexes)
                bp.params.originLineNo = bp.lineNo;
                bp.lineNo = currentLine;
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
        this.removeBreakpoint(this.context, bp.href, bp.lineNo, function(response, bpClient)
        {
            self.dispatch("onBreakpointRemoved", [self.context, bp]);
        });
    },

    onEnableBreakpoint: function(bp)
    {
        var self = this;
        this.enableBreakpoint(this.context, bp.href, bp.lineNo, function(response, bpClient)
        {
            self.dispatch("onBreakpointEnabled", [self.context, bp]);
        });
    },

    onDisableBreakpoint: function(bp)
    {
        var self = this;
        this.disableBreakpoint(this.context, bp.href, bp.lineNo, function(response, bpClient)
        {
            self.dispatch("onBreakpointDisabled", [self.context, bp]);
        });
    },

    onModifyBreakpoint: function(bp)
    {
        this.dispatch("onBreakpointModified", [this.context, bp]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.activeThread)
        {
            TraceError.sysout("debuggerTool.setBreakpoint; ERROR Can't set BP, no thread.");
            return;
        }

        Trace.sysout("debuggerTool.setBreakpoint; " + url + " (" + lineNumber + ")");

        // Do not create two server side breakpoints at the same line.
        var bpClient = this.getBreakpointClient(this.context, url, lineNumber);
        if (bpClient)
        {
            Trace.sysout("debuggerTool.onAddBreakpoint; BP client already exists", bpClient);

            //xxxHonza: the callback expects a packet, it should not.
            if (callback)
                callback({}, bpClient);
            return;
        }

        // Prepare a callback to handle response from the server side.
        var self = this;
        var doSetBreakpoint = function _doSetBreakpoint(response, bpClient)
        {
            var actualLocation = response.actualLocation;

            Trace.sysout("debuggerTool.onSetBreakpoint; " + bpClient.location.url + " (" +
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
            if (!context.breakpointClients)
                context.breakpointClients = [];

            // xxxHonza: Florent, do we still need this? The min FF is 20+
            // FF 19: uses same breakpoint client object for a executable line and
            // all non-executable lines above that, so doesn't store breakpoint client
            // objects if there is already one with same actor.
            if (!self.breakpointActorExists(context, bpClient))
                context.breakpointClients.push(bpClient);

            if (callback)
                callback(response, bpClient);
        };

        // Send RDP packet to set a breakpoint on the server side. The callback will be
        // executed as soon as we receive a response.
        return context.activeThread.setBreakpoint({
            url: url,
            line: lineNumber + 1
        }, doSetBreakpoint);
    },

    // xxxHonza: execute the callback as soon as all breakpoints are set on the server side.
    setBreakpoints: function(context, arr, cb)
    {
        var thread = context.activeThread;
        if (!thread)
        {
            TraceError.sysout("debuggerTool.setBreakpoints; Can't set breakpoints " +
                "if there is no active thread");
            return;
        }

        var self = this;
        var doSetBreakpoints = function _doSetBreakpoints(callback)
        {
            Trace.sysout("debuggerTool.doSetBreakpoints; ", arr);

            // Iterate all breakpoints and set them step by step. The thread is
            // paused at this point.
            for (var i=0; i<arr.length; i++)
                self.onAddBreakpoint(arr[i]);
        };

        // If the thread is currently paused, go to set all the breakpoints.
        if (thread.paused)
        {
            doSetBreakpoints();
            return;
        }

        // ... otherwise we need to interupt the thread first.
        thread.interrupt(function(response)
        {
            if (response.error)
            {
                TraceError.sysout("debuggerTool.setBreakpoints; Can't set breakpoints: " +
                    response.error);
                return;
            }

            // When the thread is interrupted, we can set all the breakpoints.
            doSetBreakpoints(self.resume.bind(self, context));
        });
    },

    removeBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.activeThread)
        {
            TraceError.sysout("debuggerTool.removeBreakpoint; Can't remove breakpoints.");
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

        // We need to get the breakpoint client object for this context. The client.
        // knowns how to remove the breakpoint on the server side.
        var client = this.removeBreakpointClient(context, url, lineNumber);
        if (client)
        {
            client.remove(callback);
        }
        else
        {
            TraceError.sysout("debuggerToo.removeBreakpoint; ERROR removing " +
                "non existing breakpoint. " + url + ", " + lineNumber);
        }
    },

    getBreakpointClient: function(context, url, lineNumber)
    {
        var clients = context.breakpointClients;
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

    removeBreakpointClient: function(context, url, lineNumber)
    {
        var clients = context.breakpointClients;
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

    breakpointActorExists: function(context, bpClient)
    {
        var clients = context.breakpointClients;
        if (!clients)
            return false;
        var client;
        for (var i=0, len = clients.length; i < len; i++)
        {
            client = clients[i];
            if (client.actor === bpClient.actor)
            {
                return true;
            }
        }
        return false;
    },

    enableBreakpoint: function(context, url, lineNumber, callback)
    {
        // Enable breakpoint means adding it to the server side.
        this.setBreakpoint(context, url, lineNumber, callback);
    },

    disableBreakpoint: function(context, url, lineNumber, callback)
    {
        // Disable breakpoint means removing it from the server side.
        this.removeBreakpoint(context, url, lineNumber, callback);
    },

    isBreakpointDisabled: function(context, url, lineNumber)
    {
        //return JSDebugger.fbs.isBreakpointDisabled(url, lineNumber);
    },

    getBreakpointCondition: function(context, url, lineNumber)
    {
        //return JSDebugger.fbs.getBreakpointCondition(url, lineNumber);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging API

    rerun: function(context)
    {
    },

    resume: function(context, callback, limit)
    {
        return context.activeThread.resume(callback, limit);
    },

    stepOver: function(context, callback)
    {
        return context.activeThread.stepOver(callback);
    },

    stepInto: function(context, callback)
    {
        return context.activeThread.stepIn(callback);
    },

    stepOut: function(context, callback)
    {
        return context.activeThread.stepOut(callback);
    },

    runUntil: function(context, compilationUnit, lineNumber, callback)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Trace API

    getCurrentFrame: function(context)
    {
        return context.currentFrame;
    },

    getCurrentTrace: function(context)
    {
        return context.currentTrace;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Evaluation

    eval: function(context, frame, expr, callback)
    {
        Trace.sysout("debuggerTool.eval; " + expr);

        if (!frame)
            frame = context.currentFrame;

        // xxxHonza: can this happen?
        if (context.evalCallback)
            FBTrace.sysout("debuggerTool.eval; ERROR unhandled case!");

        // Will be executed when 'clientEvaluated' packet is received, see paused() method.
        if (callback)
            context.evalCallback = this.getEvalCallback(callback, context);

        // This operation causes the server side to:
        // 1) Resume the current thread
        // 2) Evaluate the expresion in a new frame
        // 3) Remove the frame and pause
        context.activeThread.eval(frame.getActor(), expr, function(response)
        {
            // Not interested in 'resume' packet. The callback will be executed
            // when 'pause' packet is received, see paused() method.
        });
    },

    getEvalCallback: function(callback, context)
    {
        var currentPauseActor = context.currentPauseActor;
        return function evalCallback(context, event, packet)
        {
            try
            {
                // Make sure we are not just re-using the current clientEvaluated packet
                // (e.g. related to BP condition). It must be one from next roundtrip/pause.
                if (context.currentPauseActor != currentPauseActor)
                    callback(context, event, packet);
            }
            catch (e)
            {
                TraceError.sysout("debuggerTool.evalCallback; EXCEPTION " + e, e);
            }
        }
    },

    // xxxHonza: used to get boolean result of evaluated breakpoint condition
    // should be somewhere is an API library so, we can share it. 
    isFalse: function(descriptor)
    {
        if (!descriptor || typeof(descriptor) != "object")
            return true;

        // As described in the remote debugger protocol, the value grip
        // must be contained in a 'value' property.
        var grip = descriptor.value;
        if (typeof(grip) != "object")
            return !grip;

        // For convenience, undefined and null are both considered types.
        var type = grip.type;
        if (type == "undefined" || type == "null")
            return true;

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Break On Exceptions

    breakOnExceptions: function(context, flag)
    {
        return context.activeThread.pauseOnExceptions(flag, function(response)
        {
            Trace.sysout("debuggerTool.breakOnExceptions; Set to " + flag, response);
        });
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool("debugger", DebuggerTool);

return DebuggerTool;

// ********************************************************************************************* //
});
