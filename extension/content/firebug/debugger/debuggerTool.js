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
    "firebug/debugger/debuggerLib",
],
function (Obj, Firebug, FBTrace, Arr, Tool, CompilationUnit, StackFrame, StackTrace,
    DebuggerClientModule, ClientCache, SourceFile, BreakpointStore, Options, DebuggerLib) {

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
 * @object DebuggerTool object is automatically instanciated by the framework for each
 * context. Reference to the current context is passed to the constructor. Life cycle
 * of a tool object is the same as for a panel, but tool doesn't have any UI.
 *
 * xxxHonza: It should be derived from Tool base class.
 */
DebuggerTool.prototype = Obj.extend(new Firebug.EventSource(),
/** @lends DebuggerTool */
{
    dispatchName: "DebuggerTool",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    attach: function()
    {
        Trace.sysout("debuggerTool.attach; context ID: " + this.context.getId());

        this.attachListeners();

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles();

        // Initialize break on exception flag.
        this.breakOnExceptions(Options.get("breakOnExceptions"));

        BreakpointStore.addListener(this);
    },

    detach: function()
    {
        Trace.sysout("debuggerTool.detach; context ID: " + this.context.getId());

        if (this.context.stopped)
        {
            // If Firefox tab with active debugger has been closed, the resumed packet
            // is not received and so, fire it now. This is to make sure that
            // onStopDebugging is dispatched to the listeners (e.g. to the Script panel).
            this.resumed();

            // xxxHonza: not sure where this belongs, but if the currently selected panel
            // (in the new selected context) is the Script panel, we should make sure
            // to update it so the "Debugger is already active" message is removed.
            var currContext = Firebug.currentContext;
            if (currContext && currContext != this.context)
            {
                var panel = currContext.getPanel("script");
                if (panel && panel === Firebug.chrome.getSelectedPanel())
                {
                    var state = Firebug.getPanelState(panel);
                    panel.show(state);
                }
            }
        }

        // Detach client-thread listeners.
        this.detachListeners();

        BreakpointStore.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listeners

    attachListeners: function()
    {
        // Bail out if listeners are already attached.
        if (this._onPause)
            return;

        // This is the place where we bind all listeners to the current
        // context so, it's available inside the methods.
        this._onPause = this.paused.bind(this);
        this._onDetached = this.detached.bind(this);
        this._onResumed = this.resumed.bind(this);
        this._onFramesAdded = this.framesadded.bind(this);
        this._onFramesCleared = this.framescleared.bind(this);
        this._onNewScript = this.newScript.bind(this);

        // Add all listeners
        this.context.activeThread.addListener("paused", this._onPause);
        this.context.activeThread.addListener("detached", this._onDetached);
        this.context.activeThread.addListener("resumed", this._onResumed);

        // These events are used to sync with ThreadClient's stack frame cache.
        this.context.activeThread.addListener("framesadded", this._onFramesAdded);
        this.context.activeThread.addListener("framescleared", this._onFramesCleared);

        DebuggerClientModule.client.addListener("newSource", this._onNewScript);
    },

    detachListeners: function()
    {
        // Bail out if listeners are already dettached.
        if (!this._onPause)
            return;

        // Remove all listeners from the current ThreadClient
        this.context.activeThread.removeListener("paused", this._onPause);
        this.context.activeThread.removeListener("detached", this._onDetached);
        this.context.activeThread.removeListener("resumed", this._onResumed);
        this.context.activeThread.removeListener("framesadded", this._onFramesAdded);
        this.context.activeThread.removeListener("framescleared", this._onFramesCleared);

        DebuggerClientModule.client.removeListener("newSource", this._onNewScript);

        this._onPause = null;
        this._onDetached = null;
        this._onResumed = null;
        this._onFramesAdded = null;
        this._onFramesCleared = null;
        this._onNewScript = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Script Sources

    updateScriptFiles: function()
    {
        Trace.sysout("debuggerTool.updateScriptFiles; context id: " + this.context.getId());

        var self = this;
        this.context.activeThread.getSources(function(response)
        {
            // The tool is already destroyed so, bail out.
            if (!self._onPause)
                return;

            var sources = response.sources;
            for (var i=0; i<sources.length; i++)
                self.addScript(sources[i]);
        });
    },

    newScript: function(type, response)
    {
        Trace.sysout("debuggerTool.newScript; context id: " + this.context.getId() +
            ", script url: " + response.source.url, response);

        // Ignore scripts coming from different threads.
        // This is because 'newScript' listener is registered in 'DebuggerClient' not
        // in 'ThreadClient'.
        if (this.context.activeThread.actor != response.from)
            return;

        this.addScript(response.source);
    },

    addScript: function(script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // created e.g. as the user is evaluating expressions in the watch window.
        if (DebuggerLib.isFrameLocationEval(script.url))
            return;

        if (!this.context.sourceFileMap)
        {
            TraceError.sysout("debuggerTool.addScript; ERROR Source File Map is NULL", script);
            return;
        }

        // xxxHonza: Ignore inner script for now
        if (this.context.sourceFileMap[script.url])
            return;

        // Create a source file and append it into the context.
        var sourceFile = new SourceFile(script.actor, script.url);
        this.context.addSourceFile(sourceFile);

        // Notify listeners (e.g. the Script panel) to updated itself. It can happen
        // that the Script panel has been empty until now and need to display a script.
        this.dispatch("newScript", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(event, packet)
    {
        var type = packet.why.type;
        var where = packet.frame ? packet.frame.where : {};
        Trace.sysout("debuggerTool.paused; " + type + ", " + where.url +
            " (" + where.line + "), context ID: " + this.context.getId(), packet);

        var ignoreTypes = {
            "interrupted": 1,
        };

        if (ignoreTypes[type])
            return;

        this.context.clientCache.clear();

        if (!packet.frame)
        {
            FBTrace.sysout("debuggerTool.paused; ERROR no frame!", packet);
            return;
        }

        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=829028
        // Avoid double-break at the same line (e.g. breakpoint + step-over)

        // Create stack of frames and initialize context.
        // context.stoppedFrame: the frame we stopped in, don't change this elsewhere.
        // context.currentFrame: the frame we show to user, depends on selection.
        // xxxHonza: if there are any watch expressions in the Watch panel, the
        // currentFrame is reset by 'clientEvaluated' packet (round trip). The current frame
        // selection should be remembered (as an index?) and updated when the 'clientEvaluated'
        // is received.
        var frame = StackFrame.buildStackFrame(packet.frame, this.context);
        this.context.stoppedFrame = frame;
        this.context.currentFrame = frame;
        this.context.stopped = true;
        this.context.currentPauseActor = packet.actor;

        // Notify listeners, about debugger pause event.
        this.dispatch("onDebuggerPaused", [this.context, event, packet])

        // Helper resume function
        function doResume(tool)
        {
            // Get resume limit type from the context (doesn't have to be set).
            var resumeLimit = tool.context.resumeLimit;
            delete tool.context.resumeLimit;

            // Resume debugger
            return tool.resume(null, resumeLimit);
        }

        // Send event allowing immediate resume. If at least one listener returns
        // true, the debugger will resume.
        if (this.dispatch2("shouldResumeDebugger", [this.context, event, packet]))
        {
            Trace.sysout("debuggerTool.paused; Listeners want to resume the debugger.");
            return doResume(this);
        }

        // Send event asking whether the debugger should really break. If at least
        // one listeners returns true, the debugger just continues with pause.
        if (!this.dispatch2("shouldBreakDebugger", [this.context, event, packet]))
        {
            Trace.sysout("debuggerTool.paused; Listeners don't want to break the debugger.");
            return doResume(this);
        }

        // Asynchronously initializes ThreadClient's stack frame cache. If you want to
        // sync with the cache handle 'framesadded' and 'framescleared' events.
        // This is done after we know that the debugger is going to pause now.
        this.context.activeThread.fillFrames(50);

        // Panels are created when first used by the user, but in this case we need to break
        // JS execution and show it in the Script panel immediatelly so, it needs to exist before
        // firing 'onStartDebugging' event.
        this.context.getPanel("script");

        // Notify listeners. E.g. the {@ScriptPanel} panel needs to update its UI.
        this.dispatch("onStartDebugging", [this.context, event, packet]);

        // Execute registered 'clientEvaluated' callback.
        // This must be done after "onStartDebugging" is dispatched to the Script panel, which
        // is updating selection of the Watch panel and could potentially start Watch expr
        // evaluation again (since evalInProgress would be false i.e. done).
        // xxxHonza: still bad architecture, the eval() method should have a simple callback
        // even if the action is spreaded over resume-pause roundtrip.
        if (type == "clientEvaluated" && this.context.evalCallback)
        {
            this.context.evalCallback(this.context, event, packet);
            this.context.evalCallback = null;
        }
    },

    resumed: function()
    {
        Trace.sysout("debuggerTool.resumed; ", arguments);

        if (this.context.clientCache)
            this.context.clientCache.clear();

        this.context.stopped = false;
        this.context.stoppedFrame = null;
        this.context.currentFrame = null;
        this.context.currentTrace = null;

        this.dispatch("onStopDebugging", [this.context]);
    },

    detached: function()
    {
        Trace.sysout("debuggerTool.detached; ", arguments);

        this.context.clientCache.clear();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Frames

    framesadded: function()
    {
        // Get frames from ThreadClient's stack-frame cache and build stack trace object,
        // which is stored in the context.
        var frames = this.context.activeThread.cachedFrames;
        Trace.sysout("debuggerTool.framesadded; frames: ", frames);

        this.context.currentTrace = StackTrace.buildStackTrace(this.context, frames);

        // Now notify all listeners, for example the {@CallstackPanel} panel to sync the UI.
        this.dispatch("framesadded", [this.context.currentTrace]);
    },

    framescleared: function()
    {
        Trace.sysout("debuggerTool.framescleared; ", arguments);

        this.context.currentTrace = null;

        this.dispatch("framescleared");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BreakpointStore Event Listener

    // DebuggerTool (one instance per context) object is handling events coming from
    // BreakpointStore (one instance per Firebug). It consequently performs async operation
    // with the server side (using RDP) and forwarding results to all registered listeners
    // (usually panel objects)

    onAddBreakpoint: function(bp)
    {
        Trace.sysout("debuggerTool.onAddBreakpoint;", bp);

        var self = this;
        this.setBreakpoint(bp.href, bp.lineNo, function(response, bpClient)
        {
            Trace.sysout("debuggerTool.onAddBreakpoint; callback executed", response);

            // Autocorrect shared breakpoint object if necessary and store the original
            // line so, listeners (like e.g. the Script panel) can update the UI.
            var currentLine = bpClient.location.line - 1;
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
    // Breakpoints

    setBreakpoint: function(url, lineNumber, callback)
    {
        if (!this.context.activeThread)
        {
            TraceError.sysout("debuggerTool.setBreakpoint; ERROR Can't set BP, no thread.");
            return;
        }

        Trace.sysout("debuggerTool.setBreakpoint; " + url + " (" + lineNumber + ")");

        // Do not create two server side breakpoints at the same line.
        var bpClient = this.getBreakpointClient(url, lineNumber);
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
            if (!self.context.breakpointClients)
                self.context.breakpointClients = [];

            // xxxHonza: Florent, do we still need this? The min FF is 20+
            // xxxFarshid: Yes, we do.
            // FF 19+: uses same breakpoint client object for a executable line and
            // all non-executable lines above that, so doesn't store breakpoint client
            // objects if there is already one with same actor.
            if (!self.breakpointActorExists(bpClient))
                self.context.breakpointClients.push(bpClient);

            if (callback)
                callback(response, bpClient);
        };

        // Send RDP packet to set a breakpoint on the server side. The callback will be
        // executed as soon as we receive a response.
        return this.context.activeThread.setBreakpoint({
            url: url,
            line: lineNumber + 1
        }, doSetBreakpoint);
    },

    // xxxHonza: execute the callback as soon as all breakpoints are set on the server side.
    setBreakpoints: function(arr, cb)
    {
        var thread = this.context.activeThread;
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
            doSetBreakpoints(self.resume.bind(self));
        });
    },

    removeBreakpoint: function(url, lineNumber, callback)
    {
        if (!this.context.activeThread)
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
        var client = this.removeBreakpointClient(url, lineNumber);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging API

    rerun: function()
    {
    },

    resume: function(callback, limit)
    {
        Trace.sysout("debuggerTool.resume; limit: " + limit);

        // xxxHonza: do not use _doResume. Use stepping methods instead.
        return this.context.activeThread._doResume(limit, callback);
    },

    stepOver: function(callback)
    {
        // The callback must be passed into the stepping functions, otherwise there is
        // an exception.
        return this.context.activeThread.stepOver(function()
        {
            if (callback)
                callback();
        });
    },

    stepInto: function(callback)
    {
        return this.context.activeThread.stepIn(function()
        {
            if (callback)
                callback();
        });
    },

    stepOut: function(callback)
    {
        return this.context.activeThread.stepOut(function()
        {
            if (callback)
                callback();
        });
    },

    runUntil: function(compilationUnit, lineNumber, callback)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Trace API

    getCurrentFrame: function()
    {
        return this.context.currentFrame;
    },

    getCurrentTrace: function()
    {
        return this.context.currentTrace;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Evaluation

    eval: function(frame, expr, callback)
    {
        Trace.sysout("debuggerTool.eval; " + expr);

        if (!frame)
            frame = this.context.currentFrame;

        // xxxHonza: can this happen?
        if (this.context.evalCallback)
            FBTrace.sysout("debuggerTool.eval; ERROR unhandled case!");

        // Will be executed when 'clientEvaluated' packet is received, see paused() method.
        if (callback)
            this.context.evalCallback = this.getEvalCallback(callback);

        // This operation causes the server side to:
        // 1) Resume the current thread
        // 2) Evaluate the expresion in a new frame
        // 3) Remove the frame and pause
        this.context.activeThread.eval(frame.getActor(), expr, function(response)
        {
            // Not interested in 'resume' packet. The callback will be executed
            // when 'pause' packet is received, see paused() method.
        });
    },

    getEvalCallback: function(callback)
    {
        var currentPauseActor = this.context.currentPauseActor;
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

    breakOnExceptions: function(flag)
    {
        return this.context.activeThread.pauseOnExceptions(flag, function(response)
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
