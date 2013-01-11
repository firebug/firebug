/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/trace/traceListener",
    "firebug/trace/traceModule",
    "firebug/debugger/debuggerTool", //xxxHonza: So, it's the DebuggerClientModule first listener
    "firebug/debugger/debugger",
    "firebug/debugger/script/scriptPanel",
    "firebug/debugger/breakpoint/breakpointStore",
    "firebug/debugger/breakpoint/breakpointModule",
    "firebug/debugger/breakpoint/breakpointPanel",
    "firebug/debugger/breakpoint/breakpointReps",
    "firebug/debugger/stack/callstackPanel",
    "firebug/debugger/stack/stackFrameRep",
    "firebug/debugger/stack/stackTraceRep",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/debugger/watch/watchPanel",
    "firebug/debugger/grips/gripCache",
    "firebug/debugger/grips/functionGrip",
    "firebug/debugger/commands",
    "firebug/remoting/debuggerClientModule",
],
function(FBTrace, TraceListener, TraceModule) {

// ********************************************************************************************* //
// Debugger

// This module just defines a list of dependencies for JSD2 debugger so,
// all necessary modules are properyly loaded.

// Register stylesheet with DBG_* styles
// xxxHonza: any better way how to register global Firebug stylesheth with trace styles?
TraceModule.addListener(new TraceListener("jsd2.", "DBG_JSD2", true,
    "chrome://firebug/skin/trace.css"));

// ********************************************************************************************* //
// Registration

return {}

// ********************************************************************************************* //
});
