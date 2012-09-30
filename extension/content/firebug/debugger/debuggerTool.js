/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/tool",
    "firebug/debugger/debuggerClient",
    "arch/compilationunit",
    "firebug/debugger/stackFrame",
    "firebug/debugger/stackTrace",
],
function (Obj, Firebug, Tool, DebuggerClient, CompilationUnit, StackFrame, StackTrace) {

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
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    attach: function(context, connection, listener, callback)
    {
        this.addListener(listener);

        if (context.debuggerClient)
            return;

        var self = this;

        // Attach the debugger.
        context.debuggerClient = new DebuggerClient(context, connection);
        context.debuggerClient.attach(function(activeThread)
        {
            activeThread.addListener(self);

            if (callback)
                callback(activeThread);

            self.dispatch("onThreadAttached", [activeThread]);
        });
    },

    detach: function(context, connection, listener)
    {
        this.removeListener(listener);

        // More panels using this tool can call detach. So, check first if we are 
        // detached already before sending the 'detach' packet.
        // xxxHonza: we need to count listeners and detach when there is none.
        if (!context.debuggerClient)
            return;

        context.debuggerClient.detach(function(activeThread)
        {
            activeThread.removeListener(this);
        });

        context.debuggerClient = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(context, packet)
    {
        // @hack: all types should be supported?
        var types = {
            "breakpoint": 1,
            "resumeLimit": 1,
            "debuggerStatement": 1,
        };

        var type = packet.why.type;
        if (types[type])
        {
            context.debuggerClient.activeThread.fillFrames(50);

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

    resumed: function(context, packet)
    {
        context.stopped = false;
        context.stoppedFrame = null;
        context.currentFrame = null;
        context.currentTrace = null;

        this.dispatch("onStopDebugging");
    },

    framesadded: function(context, frames)
    {
        var stackTrace = StackTrace.buildStackTrace(frames, context);
        context.currentTrace = stackTrace;

        this.dispatch("onStackCreated", [stackTrace]);
    },

    framescleared: function()
    {
        this.dispatch("onStackCleared");
    },

    newScript: function(sourceFile)
    {
        this.dispatch("newScript", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint API

    setBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.debuggerClient.activeThread)
        {
            FBTrace.sysout("debuggerTool.setBreakpoint; Can't set a breakpoint.");
            return;
        }

        return context.debuggerClient.activeThread.setBreakpoint({
            url: url,
            line: lineNumber
        }, callback);
    },

    setBreakpoints: function(context, arr, callback)
    {
        if (!context.debuggerClient.activeThread)
        {
            FBTrace.sysout("debuggerTool.setBreakpoints; Can't set breakpoints.");
            return;
        }

        return context.debuggerClient.activeThread.setBreakpoints(arr, callback);
    },

    removeBreakpoint: function(context, bp, callback)
    {
        if (!context.debuggerClient.activeThread)
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
            return context.debuggerClient.activeThread.removeBreakpoints(arr, callback);
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
        return context.debuggerClient.activeThread.resume(callback);
    },

    stepOver: function(context, callback)
    {
        return context.debuggerClient.activeThread.stepOver(callback);
    },

    stepInto: function(context, callback)
    {
        return context.debuggerClient.activeThread.stepIn(callback);
    },

    stepOut: function(context, callback)
    {
        return context.debuggerClient.activeThread.stepOut(callback);
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
        context.debuggerClient.activeThread.eval(frame.getActor(), expr, function(response)
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