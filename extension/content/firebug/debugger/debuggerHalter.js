/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/debugger/debuggerLib",
],
function(Obj, Firebug, DebuggerLib) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DEBUGGERHALTER");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// DebuggerHalter Implementation

var DebuggerHalter = Obj.extend(Firebug.Module,
{
    dispatchName: "DebuggerHalter",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
    },

    initContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.addListener(this);
    },

    destroyContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    shouldResumeDebugger: function(context, event, packet)
    {
        var where = packet.frame ? packet.frame.where : {};
        if (where.url != "debugger eval code")
            return false;

        Trace.sysout("debuggerHalter.onDebuggerPaused; " + where.url, packet);

        // Resume the debugger till the url is not 'debugger eval code'. This way we can
        // unwind frames that don't come from the page content JS.
        context.resumeLimit = {type: "step"};
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    breakNow: function(context)
    {
        DebuggerLib.breakNow(context);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerHalter);

return DebuggerHalter;

// ********************************************************************************************* //
});
