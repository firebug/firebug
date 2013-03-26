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

/**
 * @module
 */
var DebuggerTool = Obj.extend(Firebug.Module,
/** @lends DebuggerTool */
{
    dispatchName: "DebuggerTool",

    toolName: "debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        Firebug.registerTracePrefix("debuggerTool.", "DBG_DEBUGGERTOOL", false);

        // Listen to the debugger-client, which represents the connection to the server.
        // The debugger-client object represents the source of all RDP events.
        DebuggerClientModule.addListener(this);

        // Hook XUL stepping buttons.
        var chrome = Firebug.chrome;
        chrome.setGlobalAttribute("cmd_firebug_rerun", "oncommand",
            "Firebug.DebuggerTool.rerun(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "oncommand",
            "Firebug.DebuggerTool.resume(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepOver", "oncommand",
            "Firebug.DebuggerTool.stepOver(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepInto", "oncommand",
            "Firebug.DebuggerTool.stepInto(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepOut", "oncommand",
            "Firebug.DebuggerTool.stepOut(Firebug.currentContext)");

        Trace.sysout("debuggerTool.initialized;");
    },

    shutdown: function()
    {
        Firebug.unregisterTracePrefix("debuggerTool.");

        DebuggerClientModule.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tabs

    onTabNavigated: function()
    {
        this.dispatch("onTabNavigated");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context, persistedState)
    {
        Trace.sysout("debuggerTool.initContext; context ID: " + context.getId());

        // If page reload happens the thread client remains the same so,
        // preserve also all existing breakpoint clients.
        // See also {@DebuggerClientModule.initConext}
        if (persistedState)
        {
            context.breakpointClients = persistedState.breakpointClients;
        }
    },

    showContext: function(browser, context)
    {
        // xxxHonza: see TabWatcher.unwatchContext
        if (!context)
            return;

        Trace.sysout("debuggerTool.showContext; context ID: " + context.getId());
    },

    destroyContext: function(context, persistedState, browser)
    {
        this.detachListeners(context);

        persistedState.breakpointClients = context.breakpointClients;

        Trace.sysout("debuggerTool.destroyContext; context ID: " + context.getId());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onThreadAttached: function(context, reload)
    {
        Trace.sysout("debuggerTool.onThreadAttached; reload: " + reload + ", context ID: " +
            context.getId(), context);

        this.attachListeners(context);

        // Create grip cache
        context.clientCache = new ClientCache(DebuggerClientModule.client, context);

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles(context);

        // Initialize break on exception flag.
        this.breakOnExceptions(context, Options.get("breakOnExceptions"));
    },

    onThreadDetached: function(context)
    {
        Trace.sysout("debuggerTool.onThreadDetached; context ID: " + context.getId());

        this.detachListeners(context);
    },

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
        /*if (context.lastDebuggerLocation &&
            context.lastDebuggerLocation.url == packet.frame.where.url &&
            context.lastDebuggerLocation.line == packet.frame.where.line)
        {
            Trace.sysout("debuggerTool.Resume pause since it happens at the same location: " +
                packet.frame.where.url + " (" + packet.frame.where.line + ")");
            this.stepOver(context);
            return;
        }*/

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

        // Apply breakpoint condition logic. If a breakpoint-condition evaluation
        // result is false, the debugger is immediatelly resumed.
        if (!this.checkBreakpointCondition(context, event, packet))
            return;

        //context.lastDebuggerLocation = packet.frame.where;

        // Asynchronously initializes ThreadClient's stack frame cache. If you want to
        // sync with the cache handle 'framesadded' and 'framescleared' events.
        // This is done after we know that the debugger is going to pause now.
        context.activeThread.fillFrames(50);

        // Panels are created when first used by the user, but in this case we need to break
        // JS execution and update the Script panel immediatelly so, make sure it exists before
        // we distribute 'onStartDebugging' event. The panel doesn't have to exist in case 
        // the page breaks before it's fully loaded (e.g. in an 'onLoad' handler).
        var scriptPanel = context.getPanel("script");

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

    checkBreakpointCondition: function(context, event, packet)
    {
        var type = packet.why.type;

        // If paused by a breakpoint, evaluate optional condition expression.
        if (type == "breakpoint")
        {
            var location = packet.frame.where;
            var bp = BreakpointStore.findBreakpoint(location.url, location.line - 1);
            if (bp && bp.condition)
            {
                Trace.sysout("debuggerTool.paused; Evaluate breakpoint condition: " +
                    bp.condition, bp);

                // xxxHonza: the condition-eval could be done server-side
                // see: https://bugzilla.mozilla.org/show_bug.cgi?id=812172 
                this.eval(context, context.currentFrame, bp.condition);
                context.conditionalBreakpointEval = true;
                return false;
            }
        }

        // Resolve evaluated breakpoint condition expression (if there is one in progress).
        if (type == "clientEvaluated" && context.conditionalBreakpointEval)
        {
            context.conditionalBreakpointEval = false;

            var result = packet.why.frameFinished["return"];

            Trace.sysout("debuggerTool.paused; Breakpoint condition evaluated: " +
                result, result);

            // Resume debugger if the breakpoint condition evaluation is false
            if (!result || this.isFalse({value: result}))
            {
                this.resume(context);
                return false;
            }
        }

        // Continue with pause
        return true;
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
        Trace.sysout("debuggerTool.framesadded; ", arguments);

        // Get frames from ThreadClient's stack-frame cache and build stack trace object,
        // which is stored in the context.
        var frames = context.activeThread.cachedFrames;
        context.currentTrace = StackTrace.buildStackTrace(frames, context);

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
    // Breakpoints

    setBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.activeThread)
        {
            FBTrace.sysout("debuggerTool.setBreakpoint; Can't set a breakpoint.");
            return;
        }

        var self = this;
        var doSetBreakpoint = function _doSetBreakpoint(response, bpClient)
        {
            var actualLocation = response.actualLocation;

            Trace.sysout("debuggerTool.onSetBreakpoint; " + bpClient.location.url + " (" +
                bpClient.location.line + ")", bpClient);

            if (actualLocation && actualLocation.line != bpClient.location.line)
            {
                // To be found when it needs removing.
                bpClient.location.line = actualLocation.line;
            }

            // TODO: error logging?

            // Store breakpoint clients so, we can use the actors to remove the
            // breakpoint later.
            if (!context.breakpointClients)
                context.breakpointClients = [];

            //xxxFarshid: Shouldn't we save bpClient object only if there is no error?

            // FF 19: uses same breakpoint client object for a executable line and
            // all non-executable lines above that, so doesn't store breakpoint client
            // objects if there is already one with same actor.
            if (!self.breakpointActorExists(context, bpClient))
                context.breakpointClients.push(bpClient);

            if (callback)
                callback(response, bpClient);
        };

        return context.activeThread.setBreakpoint({
            url: url,
            line: lineNumber + 1
        }, doSetBreakpoint);
    },

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
            {
                var bp = arr[i];
                self.setBreakpoint(context, bp.href, bp.lineNo, function(response, bpClient)
                {
                    cb(response, bpClient);
                });
            }

            // xxxHonza: At this point responses are not received yet, is it ok to resume?
            if (callback)
                callback();
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
            FBTrace.sysout("debuggerTool.removeBreakpoint; Can't remove breakpoints.");
            return;
        }

        // Convert to line numbers(one-based);
        lineNumber = lineNumber + 1;

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

    removeBreakpointClient: function(context, url, lineNumber)
    {
        var clients = context.breakpointClients;
        if (!clients)
            return;

        for (var i=0; i<clients.length; i++)
        {
            var client = clients[i];
            var loc = client.location;
            if (loc.url == url && loc.line == lineNumber)
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
        this.setBreakpoint(context, url, lineNumber, callback);
    },

    disableBreakpoint: function(context, url, lineNumber, callback)
    {
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

    resume: function(context, callback)
    {
        return context.activeThread.resume(callback);
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
        return context.activeThread.pauseOnExceptions(flag);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool(DebuggerTool);
Firebug.registerModule(DebuggerTool);

// Expose to XUL stepping buttons
Firebug.DebuggerTool = DebuggerTool;

return DebuggerTool;

// ********************************************************************************************* //
});