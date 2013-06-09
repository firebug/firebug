/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/debugger/breakpoints/breakpointStore",
],
function(FBTrace, Obj, Locale, BreakpointStore) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_BREAKPOINTS");

// ********************************************************************************************* //
// Debugger Keyword

/**
 * @module Javascript debugger; keyword can be prevented by a disabled breakpoint
 * created at the same line/url. This module implements related logic by handling
 * {@DebuggerTool} object events.
 *
 * 1) onDebuggerPaused: if debugger halts at a debugger; keyword, the 'breaking cause'
 *    is created and initialized.
 *
 * 2) shouldResumeDebugger: disabled breakpoint has high priority and so it can
 *    be used to prevent the debugger keyword from halting the debugger.
 */
var DebuggerKeyword = Obj.extend(Firebug.Module,
/** @lends DebuggerKeyword */
{
    dispatchName: "debuggerKeyword",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

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

    onDebuggerPaused: function(context, event, packet)
    {
        Trace.sysout("debuggerKeyword.onDebuggerPaused;", arguments);

        // The function monitor is only interested in 'breakpoint' type of interrupts.
        var type = packet.why.type;
        if (type != "debuggerStatement")
            return;

        if (!context.stoppedFrame)
        {
            TraceError.sysout("getDebuggerKeywordCause; no current frame!");
            return;
        }

        var href = context.stoppedFrame.href;
        var line = context.stoppedFrame.line - 1;

        // Return breaking cause object. This one is for disabling the debugger; keyword
        // that caused the break in the first place.
        context.breakingCause =
        {
            title: Locale.$STR("debugger keyword"),
            skipActionTooltip: Locale.$STR("firebug.bon.tooltip.disableDebuggerKeyword2"),
            message: Locale.$STR("firebug.bon.cause.disableDebuggerKeyword2"),
            skipAction: function disableDebuggerKeywordSkipper()
            {
                Trace.sysout("getDebuggerKeywordCause.disableDebuggerKeywordSkipper; " +
                    href + ", " + line);

                // Create disabled breakpoint that prevents debugger; keyword
                BreakpointStore.addBreakpoint(href, line);
                BreakpointStore.disableBreakpoint(href, line);

                Firebug.Debugger.resume(context);
            },
        };
    },

    shouldResumeDebugger: function(context, event, packet)
    {
        Trace.sysout("debuggerKeyword.shouldResumeDebugger;", arguments);

        var type = packet.why.type;
        if (type != "debuggerStatement")
            return;

        // Resume if existing disabled breakpoint prevents the debugger keyword.
        var frame = context.stoppedFrame;
        var bp = BreakpointStore.findBreakpoint(frame.href, frame.line - 1);
        return bp && bp.isDisabled();
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerKeyword);

return DebuggerKeyword;

// ********************************************************************************************* //
});
