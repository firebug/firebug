/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, moz:true*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/chrome/tool",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
],
function (Firebug, FBTrace, Obj, Options, Tool, StackFrame, StackTrace) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
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
 */
DebuggerTool.prototype = Obj.extend(new Tool(),
/** @lends DebuggerTool */
{
    dispatchName: "DebuggerTool",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    /**
     * Executed by the framework when Firebug is attached to the {@link ThreadClient}. The event
     * is dispatched by {@link TabClient}. Note that the debugger is paused at this
     * moment but {@link TabContext#stopped} is not set (and of course there is no current frame).
     * {@link TabClient} is responsible for resuming the debugger after the 'onThreadAttached'
     * event is handled by all listeners.
     *
     * @param {Boolean} reload Set to true if the current page has been just reloaded. In such
     * case we are still attached to the same {@link ThreadClient} object.
     */
    onAttach: function(reload)
    {
        Trace.sysout("debuggerTool.attach; context ID: " + this.context.getId());

        this.attachListeners();

        // Initialize break on exception feature. This must be done only once when the thread
        // client is created not when page reload happens. Note that the same instance of the
        // thread client is used even if the page is reloaded. Otherwise it causes issue 6797
        // Since ThreadClient.pauseOnException is calling interrupt+resume if the thread
        // is not paused.
        if (!reload)
            this.updateBreakOnErrors();
    },

    onDetach: function()
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
                if (panel && panel.isSelected())
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
        // This is the place where we bind all listeners to the current
        // context so, it's available inside the methods.
        this._onPause = this.paused.bind(this);
        this._onDetached = this.detached.bind(this);
        this._onResumed = this.resumed.bind(this);
        this._onFramesAdded = this.framesadded.bind(this);
        this._onFramesCleared = this.framescleared.bind(this);

        // Add all listeners
        this.context.activeThread.addListener("paused", this._onPause);
        this.context.activeThread.addListener("detached", this._onDetached);
        this.context.activeThread.addListener("resumed", this._onResumed);

        // These events are used to sync with ThreadClient's stack frame cache.
        this.context.activeThread.addListener("framesadded", this._onFramesAdded);
        this.context.activeThread.addListener("framescleared", this._onFramesCleared);
    },

    detachListeners: function()
    {
        // Remove all listeners from the current ThreadClient
        this.context.activeThread.removeListener("paused", this._onPause);
        this.context.activeThread.removeListener("detached", this._onDetached);
        this.context.activeThread.removeListener("resumed", this._onResumed);
        this.context.activeThread.removeListener("framesadded", this._onFramesAdded);
        this.context.activeThread.removeListener("framescleared", this._onFramesCleared);

        this._onPause = null;
        this._onDetached = null;
        this._onResumed = null;
        this._onFramesAdded = null;
        this._onFramesCleared = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(event, packet)
    {
        var type = packet.why.type;
        var where = packet.frame ? packet.frame.where : {};
        Trace.sysout("debuggerTool.paused; " + type + ", " + where.url +
            " (" + where.line + "), context ID: " + this.context.getId(), packet);

        // We ignore cases when the debugger is paused because breakpoints need to be set.
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
            Trace.sysout("debuggerTool.paused; Type ignored " + type, packet);
            return;
        }

        if (!packet.frame)
        {
            TraceError.sysout("debuggerTool.paused; ERROR no frame, type: " + type, packet);
            return;
        }

        if (this.context.clientCache)
            this.context.clientCache.clear();

        // xxxHonza: this check should go somewhere else.
        // xxxHonza: this might be also done by removing/adding listeners.
        // If the Script panel is disabled (not created for the current context),
        // the debugger should not break.
        if (this.context.getPanel("script") == null)
        {
            Trace.sysout("debuggerTool.paused; Do not pause if the Script panel is disabled");
            return doResume(this);
        }

        // Backward compatibility with the protocol (URL is now in the source).
        if (!packet.frame.where.url) {
          packet.frame.where.url = packet.frame.where.source.url;
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
        this.context.currentPauseActor = packet.actor;

        // Notify listeners, about debugger pause event.
        this.dispatch("onDebuggerPaused", [this.context, event, packet]);

        // Send event allowing immediate resume. If at least one listener returns
        // true, the debugger will resume.
        if (this.dispatch2("shouldResumeDebugger", [this.context, event, packet]))
        {
            Trace.sysout("debuggerTool.paused; Listeners want to resume the debugger.");
            return doResume(this);
        }

        // Send event asking whether the debugger should really break. If at least
        // one listeners returns true, the debugger will resume.
        if (!this.dispatch2("shouldBreakDebugger", [this.context, event, packet]))
        {
            Trace.sysout("debuggerTool.paused; Listeners don't want to break the debugger.");
            return doResume(this);
        }

        // Mark the context stopped as soon as we know that we don't want to resume
        // immediately. See above code where listeners can cause that.
        // This can save a lot of updates done within this.resumed() since the debugger
        // didn't really stopped.
        // Also, this solves recursion problem (see issue 7308), that happens when
        // evaluation of expression in the {@link WatchPanel} cause exception and the
        // debugger is set to break on it. The debugger will automatically resumed
        // and so, the WatchPanel won't try to evaluate again causing the debugger
        // break again and causing infinite asynchronous loop.
        this.context.stopped = true;

        // Asynchronously initializes ThreadClient's stack frame cache. If you want to
        // sync with the cache handle 'framesadded' and 'framescleared' events.
        // This is done after we know that the debugger is paused.
        this.context.activeThread.fillFrames(50);

        // Panels are created when first used by the user, but in this case we need to break
        // JS execution and show it in the Script panel immediately so, it needs to exist before
        // firing 'onStartDebugging' event.
        this.context.getPanel("script");

        // Notify listeners. E.g. the {@link ScriptPanel} panel needs to update its UI.
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
        Trace.sysout("debuggerTool.resumed; currently stopped: " +
            this.context.stopped, arguments);

        Firebug.dispatchEvent(this.context.browser, "onResumed");

        this.context.stoppedFrame = null;
        this.context.currentFrame = null;
        this.context.currentTrace = null;
        this.context.currentPacket = null;

        // When Firebug is attached to the {@link ThreadClient} object the debugger is paused.
        // As soon as all initialization steps are done {@link TabClient} resumes the
        // debugger. In such case the {@link TabContext} object isn't stopped and there is no
        // current frame, so we just ignore the event here.
        if (!this.context.stopped)
            return;

        if (this.context.clientCache)
            this.context.clientCache.clear();

        this.context.stopped = false;

        this.dispatch("onStopDebugging", [this.context]);
    },

    detached: function()
    {
        Trace.sysout("debuggerTool.detached; ", arguments);

        if (this.context.clientCache)
            this.context.clientCache.clear();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Frames

    framesadded: function()
    {
        // Get frames from ThreadClient's stack-frame cache and build stack trace object,
        // which is stored in the context.
        var frames = this.context.activeThread.cachedFrames;

        // Backward compatibility
        for (var i=0; i<frames.length; i++)
        {
            var frame = frames[i];
            if (!frame.where.url)
                frame.where.url = frame.where.source.url;
        }

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

        // Now notify all listeners, for example the {@link CallstackPanel} panel to sync the UI.
        this.dispatch("framesadded", [this.context.currentTrace]);
    },

    framescleared: function()
    {
        Trace.sysout("debuggerTool.framescleared;", arguments);

        this.context.currentTrace = null;
        this.context.stoppedFrame = null;
        this.context.currentFrame = null;

        this.dispatch("framescleared");
    },

    cleanScopes: function()
    {
        Trace.sysout("debuggerTool.cleanScopes;");

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
        Trace.sysout("debuggerTool.resume; limit: " + (limit ? limit.type: "no type"), limit);

        // xxxHonza: do not use _doResume. Use stepping methods instead.
        return this.context.activeThread._doResume(limit, (response) =>
        {
            if (callback)
                callback();
            this.dispatch("onResumeDebugger", [this.context, limit, response]);
        });
    },

    stepOver: function(callback)
    {
        Trace.sysout("debuggerTool.stepOver");

        // The callback must be passed into the stepping functions, otherwise there is
        // an exception.
        return this.context.activeThread.stepOver(function(response)
        {
            if (callback)
                callback();
        });
    },

    stepInto: function(callback)
    {
        Trace.sysout("debuggerTool.stepInto");

        return this.context.activeThread.stepIn(function(response)
        {
            if (callback)
                callback();
        });
    },

    stepOut: function(callback)
    {
        Trace.sysout("debuggerTool.stepOut");

        return this.context.activeThread.stepOut(function(response)
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
            TraceError.sysout("debuggerTool.eval; ERROR unhandled case!");

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
        };
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

    updateBreakOnErrors: function(callback)
    {
        // Either 'breakOnExceptions' option can be set (from within the Script panel options
        // menu) or 'break on next' (BON) can be activated (on the Console panel).
        var pause = Options.get("breakOnExceptions") || this.context.breakOnErrors;
        var ignore = Options.get("ignoreCaughtExceptions");

        Trace.sysout("debuggerTool.updateBreakOnErrors; break on errors: " + pause +
            ", ignore: " + ignore + ", thread paused: " + this.context.activeThread.paused +
            ", context stopped: " + this.context.stopped);

        return this.context.activeThread.pauseOnExceptions(pause, ignore, (response) =>
        {
            Trace.sysout("debuggerTool.updateBreakOnErrors; response received:", response);
            if (callback)
                callback(this.context, pause, ignore);
        });
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool("debugger", DebuggerTool);

return DebuggerTool;

// ********************************************************************************************* //
});
