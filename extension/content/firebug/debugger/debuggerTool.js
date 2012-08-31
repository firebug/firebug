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

var DebuggerTool = Obj.extend(new Firebug.EventSource(),
{
    dispatchName: "JSD2.DebuggerTool",

    toolName: "debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    attach: function(context, connection, listener)
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
        });
    },

    detach: function(context, connection, listener)
    {
        this.removeListener(listener);

        if (!context.debuggerClient)
            return;

        context.debuggerClient.detach(function(activeThread)
        {
            activeThread.removeListener(this);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(context, url, lineNumber, callback)
    {
        return context.debuggerClient.activeThread.setBreakpoint({
            url: url,
            line: lineNumber
        }, callback);
    },

    clearBreakpoint: function(context, url, lineNumber)
    {
        // This is more correct, but bypasses Debugger
        //JSDebugger.fbs.clearBreakpoint(url, lineNumber);
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
    // Debugging

    rerun: function(context)
    {
    },

    resume: function(contex, callback)
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
    // Stack Trace

    getCurrentFrame: function(context)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(context, packet)
    {
        FBTrace.sysout("debuggerTool.paused; why: " + packet.why.type, packet);

        // @hack: shouldn't be only for breakpoints
        if (packet.why.type == "breakpoint")
        {
            context.debuggerClient.activeThread.fillFrames(50);

            var frame = StackFrame.buildStackFrame(packet.frame, context);
            this.dispatch("onStartDebugging", [frame]);
        }
    },

    framesadded: function(context, frames)
    {
        var stackTrace = StackTrace.buildStackTrace(frames, context);
        this.dispatch("onStackCreated", [stackTrace]);
    },

    framescleared: function()
    {
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool(DebuggerTool);

return DebuggerTool;

// ********************************************************************************************* //
});