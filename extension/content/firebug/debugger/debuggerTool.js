/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/tool",
    "firebug/debugger/debuggerClient",
    "arch/compilationunit"
],
function (Obj, Firebug, Tool, DebuggerClient, CompilationUnit) {

// ********************************************************************************************* //
// Debugger Tool

var DebuggerTool = Obj.extend(Firebug.Module,
{
    dispatchName: "JSD2.DebuggerTool",

    toolName: "debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(context, connection)
    {
        if (FBTrace.DBG_BTI)
            FBTrace.sysout("bti.DebuggerTool.onConnect;");

        if (context.debuggerClient)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("bti.DebuggerTool; ERROR debugger tool already registered");
            return;
        }

        // Attach the debugger.
        context.debuggerClient = new DebuggerClient(connection);
        context.debuggerClient.attach(function()
        {
            FBTrace.sysout("DebuggerTool.onConnect; Debugger attached");
        });
    },

    onDisconnect: function(context, connection)
    {
        if (context.debuggerClient)
        {
            context.debuggerClient.detach(function()
            {
                FBTrace.sysout("ScriptPanel.destroy; Debugger detached");
            });
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(context, url, lineNumber)
    {
        FBTrace.sysout("setBreakpoint " + url + ", " + lineNumber);

        context.debuggerClient.activeThread.setBreakpoint({
            url: url,
            line: lineNumber
        });
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
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerTool);
Firebug.registerTool(DebuggerTool);

return DebuggerTool;

// ********************************************************************************************* //
});