/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/tool",
    "firebug/js/debugger",
    "arch/compilationunit"
],
function (Obj, Firebug, Tool, JSDebugger, CompilationUnit) {

// ********************************************************************************************* //
// Debugger Tool

var DebuggerTool = Obj.extend(Firebug.Module,
{
    dispatchName: "DebuggerTool",

    onConnect: function(connection)
    {
        if (!Firebug.connection.getTool("script"))
        {
            DebuggerTool.tool = new Tool("debugger");
            connection.registerTool(DebuggerTool.tool);
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("JavaScriptTool onConnect ERROR script tool already registered");
        }
    },

    onDisconnect: function()
    {
        if (DebuggerTool.tool)
            connection.unregisterTool(DebuggerTool.tool);
    }
});

// ********************************************************************************************* //
// Registration

//Firebug.registerModule(DebuggerTool);

return DebuggerTool;

// ********************************************************************************************* //
});