/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/tool",
    "arch/compilationunit",
    "firebug/debugger/stackFrame",
    "firebug/debugger/stackTrace",
    "firebug/remoting/debuggerClientModule",
    "firebug/debugger/gripCache",
    "firebug/trace/traceModule",
    "firebug/trace/traceListener",
],
function (Obj, Firebug, FBTrace, Tool, CompilationUnit, StackFrame, StackTrace,
    DebuggerClientModule, GripCache, TraceModule, TraceListener) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_DEBUGGERTOOL");

// ********************************************************************************************* //
// Debugger Tool

var DebuggerTool = Obj.extend(Firebug.Module,
{
    dispatchName: "JSD2.DebuggerTool",

    toolName: "debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.traceListener = new TraceListener("debuggerTool.", "DBG_DEBUGGERTOOL", true);
        TraceModule.addListener(this.traceListener);

        DebuggerClientModule.addListener(this);

        var chrome = Firebug.chrome;

        // Hook XUL stepping buttons.
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
        TraceModule.removeListener(this.traceListener);

        DebuggerClientModule.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onThreadAttached: function(context)
    {
        context.activeThread.addListener("paused", this.paused.bind(this, context));
        context.activeThread.addListener("detached", this.detached.bind(this, context));
        context.activeThread.addListener("resumed", this.resumed.bind(this, context));
        context.activeThread.addListener("framesadded", this.framesadded.bind(this, context));
        context.activeThread.addListener("framescleared", this.framescleared.bind(this, context));
        context.activeThread.addListener("newScript", this.newScript.bind(this, context));

        context.gripCache = new GripCache(DebuggerClientModule.client);

        Trace.sysout("debuggerTool.onThreadAttached;");
    },

    onThreadDetached: function(context)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(context, event, packet)
    {
        Trace.sysout("debuggerTool.paused;");

        // @hack: all types should be supported?
        var types = {
            "breakpoint": 1,
            "resumeLimit": 1,
            "debuggerStatement": 1,
        };

        context.gripCache.clear();

        var type = packet.why.type;
        if (types[type])
        {
            context.activeThread.fillFrames(50);

            var frame = StackFrame.buildStackFrame(packet.frame, context);

            context.stopped = true;
            context.stoppedFrame = frame;  // the frame we stopped in, don't change this elsewhere.
            context.currentFrame = frame;  // the frame we show to user, depends on selection

            this.dispatch("onStartDebugging", [frame]);
        }
        else if (type == "clientEvaluated" && this.evalCallback)
        {
            // Pause packet with 'clientEvaluated' type is sent when user expression
            // has been evaluated on the server side. Let's pass the result to the
            // registered callback.
            var result = packet.why.frameFinished["return"];
            this.evalCallback(result);
            this.evalCallback = null
        }
    },

    detached: function(context)
    {
        FBTrace.sysout("debuggerTool.detached; ", arguments);

        context.gripCache.clear();
    },

    resumed: function(context, event, packet)
    {
        Trace.sysout("debuggerTool.resumed; ", arguments);

        context.gripCache.clear();

        context.stopped = false;
        context.stoppedFrame = null;
        context.currentFrame = null;
        context.currentTrace = null;

        this.dispatch("onStopDebugging");
    },

    framesadded: function(context)
    {
        var frames = context.activeThread.cachedFrames;
        var stackTrace = StackTrace.buildStackTrace(frames, context);
        context.currentTrace = stackTrace;

        this.dispatch("onStackCreated", [stackTrace]);
    },

    framescleared: function(context)
    {
        this.dispatch("onStackCleared");
    },

    newScript: function(context, sourceFile)
    {
        FBTrace.sysout("debuggerTool.newScript; ", arguments);

        this.dispatch("newScript", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint API

    setBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.activeThread)
        {
            FBTrace.sysout("debuggerTool.setBreakpoint; Can't set a breakpoint.");
            return;
        }

        return context.activeThread.setBreakpoint({
            url: url,
            line: lineNumber
        }, callback);
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
            // Iterate all breakpoints and set them step by step. The thread is
            // paused at this point.
            for (var i=0; i<arr.length; i++)
            {
                var bp = arr[i];
                self.setBreakpoint(context, bp.href, bp.lineNo, function(response, bpClient)
                {
                    // TODO: error logging.
                });
            }

            if (callback)
                callback(cb());
            else
                cb();
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
            doSetBreakpoints(this.resume.bind(this));
        });
    },

    removeBreakpoint: function(context, bp, callback)
    {
        if (!context.activeThread)
        {
            FBTrace.sysout("debuggerTool.removeBreakpoint; Can't remove breakpoints.");
            return;
        }

        if (!bp)
        {
            FBTrace.sysout("debuggerTool.removeBreakpoint; No breakpoint specified.");
            return;
        }

        var actor = bp.params.actor;
        if (actor)
            return context.activeThread.removeBreakpoints(arr, callback);
    },

    enableBreakpoint: function(context, url, lineNumber)
    {
        //JSDebugger.fbs.enableBreakpoint(url, lineNumber);
    },

    disableBreakpoint: function(context, url, lineNumber)
    {
        //JSDebugger.fbs.disableBreakpoint(url, lineNumber);
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
    // Expression API

    eval: function(context, frame, expr, callback)
    {
        var self = this;
        this.evalCallback = callback;

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