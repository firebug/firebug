/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/eventSource",
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/lib/tool",
    "arch/compilationunit",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/remoting/debuggerClientModule",
    "firebug/debugger/clients/clientCache",
    "firebug/debugger/script/sourceFile",
    "firebug/lib/options",
    "firebug/debugger/debuggerLib",
],
function (Obj, Firebug, EventSource, FBTrace, Arr, Tool, CompilationUnit, StackFrame, StackTrace,
    DebuggerClientModule, ClientCache, SourceFile, Options, DebuggerLib) {

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
 * @object DebuggerTool object is automatically instantiated by the framework for each
 * context. Reference to the current context is passed to the constructor. Life cycle
 * of a tool object is the same as for a panel, but tool doesn't have any UI.
 *
 * xxxHonza: It should be derived from Tool base class.
 */
DebuggerTool.prototype = Obj.extend(new EventSource(),
/** @lends DebuggerTool */
{
    dispatchName: "DebuggerTool",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    attach: function(reload)
    {
        Trace.sysout("debuggerTool.attach; context ID: " + this.context.getId());

        this.attachListeners();

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles();

        // Initialize break on exception feature. This must be done only once when the thread
        // client is created not when page reload happens. Note that the same instance of the
        // thread client is used even if the page is reloaded. Otherwise it causes issue 6797
        // Since ThreadClient.pauseOnException is calling interrupt+resume if the thread
        // is not paused.
        if (!reload)
            this.breakOnExceptions(Options.get("breakOnExceptions"));
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
        // Bail out if listeners are already detached.
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
        {
            Trace.sysout("debuggerTool.newScript; coming from different thread");
            return;
        }

        this.addScript(response.source);
    },

    addScript: function(script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // created e.g. as the user is evaluating expressions in the watch window.
        if (DebuggerLib.isFrameLocationEval(script.url))
        {
            Trace.sysout("debuggerTool.addScript; A script ignored " + script.type);
            return;
        }

        if (!this.context.sourceFileMap)
        {
            TraceError.sysout("debuggerTool.addScript; ERROR Source File Map is NULL", script);
            return;
        }

        // xxxHonza: Ignore inner scripts for now
        if (this.context.sourceFileMap[script.url])
        {
            Trace.sysout("debuggerTool.addScript; A script ignored: " + script.url, script);
            return;
        }

        // Create a source file and append it into the context. This is the only
        // place where an instance of {@SourceFile} is created.
        var sourceFile = new SourceFile(this.context, script.actor, script.url,
            script.isBlackBoxed);

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

        // Helper resume function
        function doResume(tool)
        {
            // Get resume limit type from the context (doesn't have to be set).
            var resumeLimit = tool.context.resumeLimit;
            delete tool.context.resumeLimit;

            // Resume debugger
            return tool.resume(null, resumeLimit);
        }

        if (ignoreTypes[type])
        {
            FBTrace.sysout("debuggerTool.paused; Type ignored " + type, packet);
            return;
        }

        this.context.clientCache.clear();

        if (!packet.frame)
        {
            FBTrace.sysout("debuggerTool.paused; ERROR no frame!", packet);
            return;
        }

        // xxxHonza: this check should go somewhere else.
        // xxxHonza: this might be also done by removing/adding listeners.
        // If the Script panel is disabled (not created for the current context,
        // the debugger should not break.
        if (this.context.getPanel("script") == null)
        {
            Trace.sysout("debuggerTool.paused; Do not pause if the Script panel is disabled");
            return doResume(this);
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
        this.context.currentPacket = packet;
        this.context.stopped = true;
        this.context.currentPauseActor = packet.actor;

        // Notify listeners, about debugger pause event.
        this.dispatch("onDebuggerPaused", [this.context, event, packet])

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
        // This is done after we know that the debugger is paused.
        this.context.activeThread.fillFrames(50);

        // Panels are created when first used by the user, but in this case we need to break
        // JS execution and show it in the Script panel immediately so, it needs to exist before
        // firing 'onStartDebugging' event.
        this.context.getPanel("script");

        // Notify listeners. E.g. the {@ScriptPanel} panel needs to update its UI.
        this.dispatch("onStartDebugging", [this.context, event, packet]);

        // Execute registered 'clientEvaluated' callback.
        // This must be done after "onStartDebugging" is dispatched to the Script panel, which
        // is updating selection of the Watch panel and could potentially start Watch expression
        // evaluation again (since evalInProgress would be false i.e. done).
        // xxxHonza: still bad architecture, the eval() method should have a simple callback
        // even if the action is spread over resume-pause round-trip.
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
        this.context.currentPacket = null;

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

        var trace = StackTrace.buildStackTrace(this.context, frames);
        this.context.currentTrace = trace;

        // Might be already set from within paused() method. It's only null if the current
        // frames have been refreshed through cleanScopes();
        if (!this.context.currentFrame)
        {
            var frame = trace.getTopFrame();
            this.context.stoppedFrame = frame;
            this.context.currentFrame = frame;
        }

        // Now notify all listeners, for example the {@CallstackPanel} panel to sync the UI.
        this.dispatch("framesadded", [this.context.currentTrace]);
    },

    framescleared: function()
    {
        Trace.sysout("debuggerTool.framescleared; ", arguments);

        this.context.currentTrace = null;
        this.context.stoppedFrame = null;
        this.context.currentFrame = null;

        this.dispatch("framescleared");
    },

    cleanScopes: function()
    {
        if (this.context.activeThread)
        {
            this.context.activeThread._clearFrames();
            this.context.activeThread.fillFrames(50);
        }
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
        Trace.sysout("debuggerTool.stepOver");

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
        Trace.sysout("debuggerTool.stepInto");

        return this.context.activeThread.stepIn(function()
        {
            if (callback)
                callback();
        });
    },

    stepOut: function(callback)
    {
        Trace.sysout("debuggerTool.stepOut");

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
        // 2) Evaluate the expression in a new frame
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

    breakOnExceptions: function(pause)
    {
        var ignore = Options.get("ignoreCaughtExceptions");

        Trace.sysout("debuggerTool.breakOnExceptions; " + pause + ", " + ignore);

        return this.context.activeThread.pauseOnExceptions(pause, ignore, function(response)
        {
            Trace.sysout("debuggerTool.breakOnExceptions; response received: ", response);
        });
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool("debugger", DebuggerTool);

return DebuggerTool;

// ********************************************************************************************* //
});
