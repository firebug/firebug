/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, unused:false, moz:true*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/chrome/module",
    "firebug/console/errorMessageRep",
    "firebug/debugger/debugger",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointModule",
    "firebug/debugger/breakpoints/breakpointStore",
],
function(Firebug, FBTrace, Obj, Options, Module, ErrorMessage, Debugger, DebuggerLib,
    BreakpointModule, BreakpointStore) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKONERROR");

// ********************************************************************************************* //
// Break On Error

/**
 * @module Implements core logic for break on error feature. Implementation
 * in this module covers:
 * 
 * - The Script panel for break on exception option
 * - The Console panel for break on next error
 */
var BreakOnError = Obj.extend(Module,
/** @lends BreakOnError */
{
    dispatchName: "BreakOnError",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initContext: function(context)
    {
        context.getTool("debugger").addListener(this);
    },

    destroyContext: function(context)
    {
        context.getTool("debugger").removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Break On Next Error Implementation

    breakOnNext: function(context, breaking, callback)
    {
        Trace.sysout("BreakOnError.breakOnNext; breaking " + breaking);

        context.breakOnErrors = breaking;

        // Set the flag on the server.
        var tool = context.getTool("debugger");
        tool.updateBreakOnErrors(callback);
    },

    shouldBreakOnNext: function(context)
    {
        return context.breakOnErrors;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listeners

    onDebuggerPaused: function(context, event, packet)
    {
        // Check the packet type, only "exception" is interesting in this case.
        var type = packet.why.type;
        if (type != "exception")
            return;

        // Reset the break-on-next-error flag after an exception break happens.
        // xxxHonza: this is how the other BON implementations work, but we could reconsider it.
        // Another problem is that the debugger breaks in every frame by default, which
        // is avoided by reseting of the flag.
        this.breakOnNext(context, false);

        // At this point, the BON flag is reset and can't be used anymore in |shouldResumeDebugger|.
        // So add a custom flag in packet.why so we know that the debugger is paused because of
        // either the Console's "Break On Next" or the Script's "Break On Exceptions" option.
        packet.why.fbPauseDueToBONError = true;

        // Get the exception object.
        var exc = DebuggerLib.getObject(context, packet.why.exception.actor);
        if (!exc)
            return;

        Trace.sysout("BreakOnError.onDebuggerPaused;", {exc: exc, packet: packet});

        // Convert to known structure, so FirebugReps.ErrorMessage.copyError() works.
        var error = {
            message: exc + "",
            href: exc.fileName,
            lineNo: exc.lineNumber
        };

        var lineNo = exc.lineNumber - 1;
        var url = exc.fileName;

        // Make sure the break notification popup appears.
        context.breakingCause =
        {
            message: error.message,
            copyAction: Obj.bindFixed(ErrorMessage.copyError, ErrorMessage, error),
            skipAction: function addSkipperAndGo()
            {
                // Create a breakpoint that never hits, but prevents BON for the error.
                var bp = BreakpointStore.addBreakpoint(url, lineNo);
                BreakpointStore.disableBreakpoint(url, lineNo);

                Debugger.resume(context);
            },
        };
    },

    shouldResumeDebugger: function(context, event, packet)
    {
        var type = packet.why.type;
        if (type != "exception")
            return false;

        // Get the exception object.
        var exc = DebuggerLib.getObject(context, packet.why.exception.actor);
        if (!exc)
            return false;

        // If 'Break On Exceptions' or 'Break On All Errors' are not set, ignore (return true).
        // Otherwise, don't resume the debugger. The user wants to break and see
        // where the error happens.
        if (!packet.why.fbPauseDueToBONError)
        {
            Trace.sysout("BreakOnError.shouldResumeDebugger; Do not break, " +
                "packet.why.fbPauseDueToBONError == false");
            return true;
        }

        if (BreakpointStore.isBreakpointDisabled(exc.fileName, exc.lineNumber - 1))
        {
            Trace.sysout("BreakOnError.shouldResumeDebugger; Do not break, disabled BP found.");
            return true;
        }

        var preview = packet.why.exception.preview;
        if (!preview)
        {
            TraceError.sysout("BreakOnError.shouldResumeDebugger; ERROR preview info isn't" +
                "available for the exception", packet);
            return false;
        }

        Trace.sysout("BreakOnError.shouldResumeDebugger; error preview:", preview);

        // This is to avoid repeated break-on-error in every frame when an error happens.
        // Break only if the original location of the exception is the same as the
        // location of the current frame.
        if (preview.lineNumber != packet.frame.where.line ||
            preview.columnNumber != packet.frame.where.column)
        {
            Trace.sysout("BreakOnError.shouldResumeDebugger; Do not break, we did already");
            return true;
        }

        return false;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(BreakOnError);

return BreakOnError;

// ********************************************************************************************* //
});
