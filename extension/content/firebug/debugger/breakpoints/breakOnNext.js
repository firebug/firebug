/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, unused:false, moz:true*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerHalter",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointModule",
],
function(Firebug, FBTrace, Obj, Module, DebuggerHalter, DebuggerLib, BreakpointModule) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKONNEXT");

// ********************************************************************************************* //
// Break On Next

/**
 * @module Implements core logic for BON (Break On Next JS execution) feature. Instances
 * of the {@link Panel} object can customize this feature using the following API.
 * 
 * {@link Panel.supportsBreakOnNext}
 * {@link Panel.breakOnNext}
 * {@link Panel.shouldBreakOnNext}
 * {@link Panel.getBreakOnNextTooltip}
 */
var BreakOnNext = Obj.extend(Module,
/** @lends BreakOnNext */
{
    dispatchName: "BreakOnNext",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initContext: function(context)
    {
        // Add listener for "shouldResumeDebugger", to check that we step into
        // an executable line.
        var tool = context.getTool("debugger");
        tool.addListener(this);
    },

    destroyContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Break On Next Implementation

    /**
     * If enabled = true, enable the onEnterFrame callback for BreakOnNext.
     * Otherwise, disable it to avoid performance penalty.
     *
     * @param context The context object.
     * @param enabled
     */
    breakOnNext: function(context, enabled, callback)
    {
        // Don't continue if we don't change the state of Break On Next.
        var breakOnNextActivated = !!context.breakOnNextActivated;
        if (enabled === breakOnNextActivated)
            return;

        Trace.sysout("breakOnNext.breakOnNext; enabled = " + enabled);

        if (enabled)
        {
            // If it doesn't exist, create one.
            if (!context.breakOnNextDebugger)
                context.breakOnNextDebugger = DebuggerLib.makeDebuggerForContext(context);

            // Bind the "onEnterFrame" event, so we break on the next
            // instruction being evaluated.
            context.breakOnNextDebugger.onEnterFrame = onEnterFrame.bind(null, context);
        }
        else if (context.breakOnNextDebugger)
        {
            // Unbind the "onEnterFrame" event and destroy the debugger.
            context.breakOnNextDebugger.onEnterFrame = undefined;
            DebuggerLib.destroyDebuggerForContext(context, context.breakOnNextDebugger);
            context.breakOnNextDebugger = null;
        }

        // Change the "breakOnNextActivated" property, so the button of the
        // script panel is updated.
        context.breakOnNextActivated = enabled;

        if (callback)
            callback(context, enabled);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listeners

    shouldResumeDebugger: function(context)
    {
        if (!context.breakOnNextActivated)
            return;

        Trace.sysout("breakOnNext.shouldResumeDebugger;");

        var location = {
            url: context.currentFrame.getURL(),
            line: context.currentFrame.getLineNumber()
        };

        // In case of an event handler break even if the line isn't executable.
        // xxxHonza: is this Firebug or platform bug?
        var nativeFrame = DebuggerLib.getCurrentFrame(context);
        if (isFrameInlineEvent(nativeFrame))
        {
            Trace.sysout("breakOnNext.shouldResumeDebugger; hit inline event handler.");
            return false;
        }

        // Don't break if the current line is not executable. Currently, the debugger might break on
        // a function definition when stepping from an inline event handler into a function.
        // See also https://bugzilla.mozilla.org/show_bug.cgi?id=969816
        if (!DebuggerLib.isExecutableLine(context, location))
        {
            Trace.sysout("breakOnNext.shouldResumeDebugger; hit a non-executable line => step in");
            context.resumeLimit = {type: "step"};
            return true;
        }
        else
        {
            Trace.sysout("breakOnNext.shouldResumeDebugger; disable Break On Next");
            // We hit an executable line. Don't break on the next instruction anymore.
            BreakOnNext.breakOnNext(context, false);
            return false;
        }
    },

    /**
     * Event handler for all "break on next" buttons.
     */
    onToggleBreakOnNext: function(event)
    {
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        var context = selectedPanel.context;
        // Ensure that the selected panel is breakable. Otherwise, abort.
        if (!selectedPanel.breakable)
            return;

        // Also ensure that the script panel is activated (required to have BON).
        // The contrary shouldn't happen (the UI prevent this case), but let's test that anyway.
        var scriptPanel = context.getPanel("script");
        if (!scriptPanel || !scriptPanel.isEnabled())
        {
            TraceError.sysout("BreakOnNext.onToggleBreakOnNext; BON activated whereas " +
                "the script panel is not activated. Abort");
            return;
        }

        var breaking = !selectedPanel.shouldBreakOnNext();

        Trace.sysout("BreakOnNext.onToggleBreakOnNext; selectedPanel = " +
            selectedPanel.name + "; breaking = " + breaking);

        selectedPanel.breakOnNext(breaking, function()
        {
            Trace.sysout("BreakOnNext.onToggleBreakOnNext; BreakOnNext " +
                (breaking ? "enabled" : "disabled"));

            // Toggle button's state.
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", !breaking);

            // Update the state of the button of the selected panel.
            BreakpointModule.updatePanelState(selectedPanel);

            // Trigger an event for the FBTest API.
            var evArgs = {context: context, breaking: breaking};
            Firebug.dispatchEvent(context.browser, "breakOnNextUpdated", evArgs);
        });
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// Helpers

function onEnterFrame(context, frame)
{
    if (frame.type === "call")
    {
        Trace.sysout("breakOnNext.onEnterFrame; triggering BreakOnNext");

        DebuggerHalter.breakNow(context);
    }
}

/**
 * Checks whether a frame is created from an inline event attribute.
 */
function isFrameInlineEvent(frame)
{
    // xxxHonza: We could probably simplify the code a lot by using introductionType
    // (suggested by Simon).

    // Hack: we don't know whether the frame is created from an inline event attribute using the
    // frame properties. As a workaround, check if the name of the callee begins with "on", that
    // an attribute of the name of the callee exists and compare if |this[callee.name] === callee|.
    var calleeName = frame.callee && frame.callee.name;
    var unsafeThis = frame.this && frame.this.unsafeDereference();
    var unsafeCallee = frame.callee.unsafeDereference();
    var parentEnv = frame.environment && frame.environment.parent;

    try
    {
        return calleeName && calleeName.startsWith("on") && unsafeThis &&
            parentEnv && parentEnv.type === "object" &&
            unsafeThis.nodeType === document.ELEMENT_NODE &&
            unsafeThis.getAttribute(calleeName) && unsafeThis[calleeName] === unsafeCallee;
    }
    catch (ex)
    {
        return false;
    }
}

// ********************************************************************************************* //
// Registration

Firebug.BreakOnNext = BreakOnNext;

Firebug.registerModule(BreakOnNext);

return BreakOnNext;

// ********************************************************************************************* //
});
