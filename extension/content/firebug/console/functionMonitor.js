/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/url",
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/chrome/panelActivation",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackFrameRep",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/debugger/stack/stackTrace",
    "firebug/console/console",
],
function(Firebug, FBTrace, Obj, Css, Dom, Domplate, Events, Locale, Url, Module, Rep,
    PanelActivation, StackFrame, StackFrameRep, SourceFile, DebuggerLib, BreakpointStore,
    StackTrace, Console) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_FUNCTIONMONITOR");

var {domplate, A, SPAN, FOR, TAG, DIV} = Domplate;

// ********************************************************************************************* //
// Function Monitor

/**
 * @module The module implements the following commands:
 * 
 * 'debug' Adds a breakpoint on the first line of a function.
 * 'undebug' Removes the breakpoint on the first line of a function.
 * 'monitor' Turns on logging for all calls to a function.
 * 'unmonitor' Turns off logging for all calls to a function.
 */
var FunctionMonitor = Obj.extend(Module,
/** @lends FunctionMonitor */
{
    dispatchName: "functionMonitor",

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
        if (type != "breakpoint")
            return;

        var frame = context.stoppedFrame;
        var monitorBp = BreakpointStore.findBreakpoint(frame.href, frame.line - 1,
            BreakpointStore.BP_MONITOR);

        Trace.sysout("functionMonitor.onDebuggerPaused; " + frame.href + " (" +
            frame.line + ") " + (monitorBp ? "BP monitor exists" : "No BP monitor"),
            monitorBp);

        // Log into the Console panel if there is a monitor.
        if (monitorBp)
            this.onMonitorScript(context, frame);
    },

    onMonitorScript: function(context, frame)
    {
        var frames = DebuggerLib.getCurrentFrames(context);
        var stackTrace = StackTrace.buildStackTrace(context, frames);

        Trace.sysout("functionMonitor.onMonitorScript; stackTrace:", stackTrace);

        Console.log(new FunctionLog(frame, stackTrace), context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging and monitoring

    monitorFunction: function(context, fn, mode)
    {
        var script = SourceFile.findScriptForFunctionInContext(context, fn);
        if (!script)
            return false;
        return this.monitorScript(context, script, mode);
    },

    unmonitorFunction: function(context, fn, mode)
    {
        var script = SourceFile.findScriptForFunctionInContext(context, fn);
        if (!script)
            return false;
        return this.unmonitorScript(context, script, mode);
    },

    monitorScript: function(context, script, mode)
    {
        Trace.sysout("functionMonitor.monitorScript; " + script.url + ", " +
            script.startLine);

        var location = {line: script.startLine, url: script.url};

        // If the first line of the script contains no code, slide down to
        // the next line that has runnable code.
        location = DebuggerLib.getNextExecutableLine(context, location);
        if (!location)
            return false;

        var type = this.getBreakpointType(mode);
        var bp = BreakpointStore.addBreakpoint(location.url, location.line - 1, null, type);
        return !!bp;
    },

    unmonitorScript: function(context, script, mode)
    {
        Trace.sysout("functionMonitor.unmonitorScript; " + script.url + ", " +
            script.startLine);

        var location = {line: script.startLine, url: script.url};
        location = DebuggerLib.getNextExecutableLine(context, location);
        if (!location)
            return false;

        var type = this.getBreakpointType(mode);
        if (!BreakpointStore.findBreakpoint(location.url, location.line - 1, type))
            return false;

        BreakpointStore.removeBreakpoint(location.url, location.line - 1, type);
        return true;
    },

    getBreakpointType: function(mode)
    {
        return (mode === "monitor" ? BreakpointStore.BP_MONITOR : BreakpointStore.BP_NORMAL);
    },

    isScriptMonitored: function(context, script)
    {
        var location = {line: script.startLine, url: script.url};
        location = DebuggerLib.getNextExecutableLine(context, location);
        if (!location)
            return false;
        var type = BreakpointStore.BP_MONITOR;
        return BreakpointStore.findBreakpoint(location.url, location.line - 1, type) != null;
    },

    clearMonitorBreakpoint: function(url, line)
    {
        BreakpointStore.removeBreakpoint(url, line, BreakpointStore.BP_MONITOR);
    }
});

// ********************************************************************************************* //
// Rep Object

function FunctionLog(frame, stackTrace)
{
    this.frame = frame;
    this.stackTrace = stackTrace;
}

// ********************************************************************************************* //
// Function Monitor Rep

var FunctionMonitorRep = domplate(Rep,
{
    className: "functionCall",
    inspectable: false,

    // xxxHonza: StackFrameRep duplication
    tag:
        Rep.tags.OBJECTBLOCK({$hasTwisty: "$object|hasStackTrace", _repObject: "$object",
            onclick: "$onToggleStackTrace"},
            A({"class": "objectLink functionCallTitle a11yFocus", _repObject: "$object"},
                "$object|getCallName"
            ),
            SPAN("("),
            SPAN({"class": "arguments"},
                FOR("arg", "$object|argIterator",
                    SPAN({"class": "argName"}, "$arg.name"),
                    SPAN("="),
                    TAG("$arg.tag", {object: "$arg.value"}),
                    SPAN({"class": "arrayComma"}, "$arg.delim")
                )
            ),
            SPAN(")"),
            SPAN({"class": "objectLink-sourceLink objectLink a11yFocus",
                _repObject: "$object|getSourceLink",
                role: "link"},
                "$object|getSourceLinkTitle"),
            DIV({"class": "stackTrace"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    hasStackTrace: function(object)
    {
        return !!object.stackTrace;
    },

    getTitle: function(object)
    {
        return object.frame.getFunctionName();
    },

    getCallName: function(object)
    {
        return this.getTitle(object);
    },

    getSourceLink: function(object)
    {
        return StackFrameRep.getSourceLink(object.frame);
    },

    getSourceLinkTitle: function(object)
    {
        return StackFrameRep.getSourceLinkTitle(object.frame);
    },

    argIterator: function(object)
    {
        return StackFrameRep.argIterator(object.frame);
    },

    onToggleStackTrace: function(event)
    {
        var target = event.originalTarget;

        // Only clicking on the expand button or the function title actually expands
        // the function call log. All other clicks keep default behavior
        if (!(Css.hasClass(target, "objectBox-functionCall") ||
            Css.hasClass(target, "functionCallTitle")))
        {
            return;
        }

        var objectBox = Dom.getAncestorByClass(target, "objectBox-functionCall");
        if (!objectBox)
            return;

        var traceBox = objectBox.getElementsByClassName("stackTrace").item(0);
        Css.toggleClass(traceBox, "opened");

        if (Css.hasClass(traceBox, "opened"))
        {
            var functionCall = objectBox.repObject;
            var stackTrace = functionCall.stackTrace;
            var rep = Firebug.getRep(stackTrace);
            rep.tag.append({object: stackTrace}, traceBox);
        }
        else
        {
            Dom.clearNode(traceBox);
        }

        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof FunctionLog;
    },

    getRealObject: function(object)
    {
        return object.frame;
    },
});

// ********************************************************************************************* //
// CommandLine Support

function makeMonitorCall(context, fn, mode, add, successKey, failureKey)
{
    var apiName = (add ? "" : "un") + mode;

    if (typeof fn !== "function")
    {
        var msg = Locale.$STRF("functionMonitor.api_call_requires_a_function", [apiName]);
        Console.logFormatted([msg], context, "error");
        return;
    }

    if (!PanelActivation.isPanelEnabled("script"))
    {
        var msg = Locale.$STRF("functionMonitor.script_panel_must_be_enabled", [apiName]);
        Console.logFormatted([msg], context, "error");
        return;
    }

    var script = SourceFile.findScriptForFunctionInContext(context, fn);
    if (!script)
    {
        var msg = Locale.$STR("functionMonitor.unable_to_locate_source");
        Console.logFormatted([msg], context, "error");
        return;
    }

    var success = (add ?
        FunctionMonitor.monitorScript(context, script, mode) :
        FunctionMonitor.unmonitorScript(context, script, mode));

    // Log a success/failure message. Failure messages for removals are harmless
    // no-ops, so mark them as "info" instead of "error". If there is no failure
    // message, assume the operation succeeded (e.g. addition failures currently
    // cannot happen).
    if (!failureKey)
        success = true;
    var msg = Locale.$STR(success ? successKey : failureKey);
    var logType = (success || !add ? "info" : "error");
    Console.logFormatted([msg], context, logType);
}

function debug(context, args)
{
    makeMonitorCall(context, args[0], "debug", true, "functionMonitor.Breakpoint_created", null);
    return Console.getDefaultReturnValue();
}

function undebug(context, args)
{
    makeMonitorCall(context, args[0], "debug", false, "functionMonitor.Breakpoint_removed",
        "functionMonitor.No_breakpoint_to_remove");
    return Console.getDefaultReturnValue();
}

function monitor(context, args)
{
    makeMonitorCall(context, args[0], "monitor", true, "functionMonitor.Monitor_created", null);
    return Console.getDefaultReturnValue();
}

function unmonitor(context, args)
{
    makeMonitorCall(context, args[0], "monitor", false, "functionMonitor.Monitor_removed",
        "functionMonitor.No_monitor_to_remove");
    return Console.getDefaultReturnValue();
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("debug", {
    handler: debug.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/debug",
    description: Locale.$STR("console.cmd.help.debug")
});

Firebug.registerCommand("undebug", {
    handler: undebug.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/undebug",
    description: Locale.$STR("console.cmd.help.undebug")
});

Firebug.registerCommand("monitor", {
    handler: monitor.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/monitor",
    description: Locale.$STR("console.cmd.help.monitor")
});

Firebug.registerCommand("unmonitor", {
    handler: unmonitor.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/unmonitor",
    description: Locale.$STR("console.cmd.help.unmonitor")
});

Firebug.registerModule(FunctionMonitor);
Firebug.registerRep(FunctionMonitorRep);

return FunctionMonitor;

// ********************************************************************************************* //
});
