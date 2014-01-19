/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, evil:true, forin:false*/
/*global Components:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/stack/stackTrace",
],
function(Firebug, FBTrace, Obj, Module, DebuggerLib, StackTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DEBUGGERHALTER");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DebuggerHalter Implementation

/**
 * @module
 */
var DebuggerHalter = Obj.extend(Module,
/** @lends DebuggerHalter */
{
    dispatchName: "DebuggerHalter",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
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
            context.breakNowInProgress = false;

            var callback = context.breakNowCallback;
            context.breakNowCallback = null;

            if (callback)
                callback();

            Trace.sysout("debuggerHalter.shouldResumeDebugger; resume debugger");

            // null means resume completely.
            context.resumeLimit = null;
            return true;
        }

        // Resume the debugger till the URL is not from chrome (e.g. Firebug). This way we
        // unwind all frames that don't come from the page content.
        if (DebuggerLib.isFrameLocationEval(where.url))
        {
            Trace.sysout("debuggerHalter.shouldResumeDebugger; resume debugger");

            context.resumeLimit = {type: "step"};
            return true;
        }

        // Resume the debugger if the current frame is global and we have reached the limit
        // of the execution of the frame. We don't want to display the frame result (issue 7134).
        if (packet.frame && packet.frame.type === "global" && packet.why.frameFinished &&
            packet.why.frameFinished.hasOwnProperty("return"))
        {
            Trace.sysout("debuggerHalter.shouldResumeDebugger; resume debugger");

            // null means resume completely.
            context.resumeLimit = null;
            return true;
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    breakNow: function(context, callback)
    {
        Trace.sysout("debuggerHalter.breakNow; " + context.getName());

        // The callback (if any) will be executed when the debugger breaks.
        context.breakNowCallback = callback;
        context.breakNowInProgress = true;

        DebuggerLib.breakNow(context);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerHalter);

return DebuggerHalter;

// ********************************************************************************************* //
});
