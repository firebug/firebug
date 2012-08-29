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
// Debugger Tool Module

var DebuggerToolModule = Obj.extend(Firebug.Module,
{
    dispatchName: "JSD2.DebuggerToolModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        if (FBTrace.DBG_BTI)
            FBTrace.sysout("bti.DebuggerTool.initialize;");

        // Register this tool as a proxy listener so, it gets all the event from the 
        // remote/local browser.
        Firebug.proxy.addListener(this);
    },

    shutdown: function()
    {
        Firebug.proxy.removeListener(this);

        if (this.debuggerClient)
        {
            this.debuggerClient.detach(function()
            {
                FBTrace.sysout("ScriptPanel.destroy; Debugger detached");
            });
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(proxy)
    {
        if (FBTrace.DBG_BTI)
            FBTrace.sysout("bti.DebuggerTool.onConnect;", proxy);

        if (proxy.getTool("debugger"))
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("bti.DebuggerTool; ERROR debugger tool already registered");
            return;
        }

        this.tool = new DebuggerTool(proxy.connection);
        proxy.registerTool(this.tool);
    },

    onDisconnect: function(proxy)
    {
        if (this.tool)
            proxy.unregisterTool(this.tool);
    },
});

// ********************************************************************************************* //
// Debugger Tool

function DebuggerTool(connection)
{
    this.toolName = "debugger";
    this.active = false;

    // Attach the debugger.
    this.debuggerClient = new DebuggerClient(connection);
    this.debuggerClient.attach(function()
    {
        FBTrace.sysout("DebuggerTool.onConnect; Debugger attached");
    });
}

DebuggerTool.prototype = Obj.extend(new Tool(),
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(context, url, lineNumber)
    {
        FBTrace.sysout("setBreakpoint " + url + ", " + lineNumber);

        this.debuggerClient.activeThread.setBreakpoint({
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

Firebug.registerModule(DebuggerToolModule);

return DebuggerToolModule;

// ********************************************************************************************* //
});