/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/clients/objectClient",
    "firebug/debugger/debuggerTool", //xxxHonza: So, it's the DebuggerClient first listener
    "firebug/debugger/breakpoints/breakpointTool",
    "firebug/debugger/debugger",
    "firebug/debugger/script/scriptPanel",
    "firebug/debugger/script/sourceTool",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/debugger/breakpoints/breakpointModule",
    "firebug/debugger/breakpoints/breakpointPanel",
    "firebug/debugger/breakpoints/breakpointReps",
    "firebug/debugger/stack/callstackPanel",
    "firebug/debugger/stack/stackFrameRep",
    "firebug/debugger/stack/stackTraceRep",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/debugger/watch/watchPanel",
    "firebug/debugger/clients/clientCache",
    "firebug/debugger/clients/functionClient",
    "firebug/debugger/commands",
    "firebug/remoting/debuggerClient",
    "firebug/debugger/clients/remoteNodeListRep",
    "firebug/debugger/breakpoints/debuggerKeyword",
],
function(FBTrace, ObjectClient) {

// ********************************************************************************************* //
// Debugger

// This module just defines a list of dependencies for JSD2 debugger so,
// all necessary modules are properly loaded.

// xxxHonza: can't be in ObjectClient since firebug/firebug is not loaded at that moment
// is there a better place?
Firebug.registerDefaultClient(ObjectClient);

// Register stylesheet with DBG_* styles
// xxxHonza: any better way how to register global Firebug stylesheet with trace styles?
Firebug.registerTracePrefix("jsd2.", "DBG_JSD2", true, "chrome://firebug/skin/trace.css");

// ********************************************************************************************* //
// Registration

return {}

// ********************************************************************************************* //
});
