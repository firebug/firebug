/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/debugger/breakpoints/breakpointStore",
],
function(Module, FBTrace, Obj, Locale, BreakpointStore) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKPOINTS");

// ********************************************************************************************* //
// Debugger Keyword

/**
 * @module This module implements logic related to debugger; keyword support. The logic
 * is based on events sent by {@link DebuggerTool} object.
 *
 * Breaking on JavaScript debugger; keyword can be prevented by creating disabled breakpoint
 * at the same line and URL.
 *
 * Handled events:
 * 1) onDebuggerPaused: if debugger halts at a debugger; keyword, the 'breaking cause'
 *    is created and initialized.
 *
 * 2) shouldResumeDebugger: disabled breakpoint has high priority and so it can
 *    be used to prevent the debugger keyword from halting the debugger.
 */
var DebuggerKeyword = Obj.extend(Module,
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
        // The function monitor is only interested in 'breakpoint' type of interrupts.
        var type = packet.why.type;
        if (type != "debuggerStatement")
            return;

        // Ignore 'breakNow' type of break. In this case the type is also 'debuggerStatement'
        // since the debugger keyword is used for break-now logic.
        if (context.breakNowInProgress)
            return;

        if (!context.stoppedFrame)
        {
            TraceError.sysout("getDebuggerKeywordCause; no current frame!");
            return;
        }

        var href = context.stoppedFrame.href;
        var line = context.stoppedFrame.line - 1;

        Trace.sysout("debuggerKeyword.onDebuggerPaused; " + href + " (" + line + ")", arguments);

        // Return breaking cause object. This one is for disabling the debugger; keyword
        // that caused the break in the first place.
        context.breakingCause =
        {
            title: Locale.$STR("firebug.bon.title.debugger_keyword"),
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
