/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/stack/stackTrace",
],
function(Obj, Firebug, DebuggerLib, StackTrace) {

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

    getCurrentStackTrace: function(context, callback)
    {
        var stackTrace;

        // breakNow halts this event loop so, even if the pause
        // is asynchronous, the current loop needs to wait till it's resumed.
        // So, the list of frames is actually get synchronously.
        this.breakNow(context, function()
        {
            var frames = DebuggerLib.getCurrentFrames(context);
            stackTrace = StackTrace.buildStackTrace(context, frames);

            Trace.sysout("debuggerHalter.getCurrentStackTrace; stackTrace:", stackTrace);

            if (callback)
                callback(stackTrace);
        });

        return stackTrace;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    shouldResumeDebugger: function(context, event, packet)
    {
        var type = packet.why.type;
        var where = packet.frame ? packet.frame.where : {};

        Trace.sysout("debuggerHalter.shouldResumeDebugger; " + where.url, packet);

        // If breakNow is in progress, execute the callback and resume
        // the debugger completely.
        if (type == "debuggerStatement" && context.breakNowCallback)
        {
            var callback = context.breakNowCallback
            delete context.breakNowCallback;

            callback();

            // null means resume completely.
            context.resumeLimit = null;
            return true;
        }

        // Resume the debugger till the url is not from chrome (e.g. Firebug). This way we
        // unwind all frames that don't come from the page content.
        if (DebuggerLib.isFrameLocationEval(where.url))
        {
            context.resumeLimit = {type: "step"};
            return true;
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    breakNow: function(context, callback)
    {
        Trace.sysout("debuggerHalter.breakNow; " + context.getName());

        // Executed when the debugger breaks.
        context.breakNowCallback = callback;

        DebuggerLib.breakNow(context);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerHalter);

return DebuggerHalter;

// ********************************************************************************************* //
});
