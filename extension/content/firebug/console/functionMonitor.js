/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/object",
    "firebug/lib/url",
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackFrameRep",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/debugger/stack/stackTrace",
],
function(FBTrace, Css, Dom, Domplate, Events, Locale, Obj, Url, Module, Rep, StackFrame,
    StackFrameRep, SourceFile, DebuggerLib, BreakpointStore, StackTrace) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_FUNCTIONMONITOR");

var {domplate, A, SPAN, FOR, TAG, DIV} = Domplate;

// ********************************************************************************************* //
// Function Monitor

/**
 * @module The module implements the 'debug', 'undebug', 'monitor' and 'unmonitor' commands.
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

        Firebug.Console.log(new FunctionLog(frame, stackTrace), context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging and monitoring

    monitorFunction: function(context, fn, mode)
    {
        if (typeof(fn) == "function")
        {
            var script = SourceFile.findScriptForFunctionInContext(context, fn);
            if (script)
            {
                this.monitorScript(context, script, mode);
            }
            else
            {
                // xxxHonza: localization
                Firebug.Console.logFormatted(
                    ["Firebug unable to locate source for function", fn], context, "info");
            }
        }
        else
        {
            Firebug.Console.logFormatted(
                ["Firebug.Debugger.monitorFunction requires a function", fn], context, "info");
        }
    },

    unmonitorFunction: function(context, fn, mode)
    {
        if (typeof(fn) == "function")
        {
            var script = SourceFile.findScriptForFunctionInContext(context, fn);
            if (script)
                this.unmonitorScript(context, script, mode);
        }
    },

    monitorScript: function(context, script, mode)
    {
        Trace.sysout("functionMonitor.monitorScript; " + script.url + ", " +
            script.startLine);

        var location = {line: script.startLine, url: script.url};

        // If the first line of the script contains no code, slide down to
        // the next line that has runnable code.
        location = DebuggerLib.getNextExecutableLine(context, location);

        var type = this.getBreakpointType(mode);
        BreakpointStore.addBreakpoint(location.url, location.line - 1, null, type);
    },

    unmonitorScript: function(context, script, mode)
    {
        Trace.sysout("functionMonitor.unmonitorScript; " + script.url + ", " +
            script.startLine);

        var location = {line: script.startLine, url: script.url};
        location = DebuggerLib.getNextExecutableLine(context, location);

        var type = this.getBreakpointType(mode);
        BreakpointStore.removeBreakpoint(location.url, location.line - 1, type);
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
        Rep.OBJECTBLOCK({$hasTwisty: "$object|hasStackTrace", _repObject: "$object",
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

// XXX Move the validation in {,un}monitorFunction into the command line functions -
// internal functions shouldn't print to the console. E.g. currently "monitor(1)" prints
// (i) Firebug.Debugger.monitorFunction requires a function 1
// (i) Monitor created for (null).
// which is wrong in so many ways...

function debug(context, args)
{
    var fn = args[0];
    FunctionMonitor.monitorFunction(context, fn, "debug");
    var msg = Locale.$STRF("functionMonitor.Breakpoint_created", [fn.name]);
    Firebug.Console.logFormatted([msg], context, "info");
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function undebug(context, args)
{
    var fn = args[0];
    FunctionMonitor.unmonitorFunction(context, fn, "debug");
    var msg = Locale.$STRF("functionMonitor.Breakpoint_removed", [fn.name]);
    Firebug.Console.logFormatted([msg], context, "info");
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function monitor(context, args)
{
    var fn = args[0];
    FunctionMonitor.monitorFunction(context, fn, "monitor");
    var msg = Locale.$STRF("functionMonitor.Monitor_created", [fn.name]);
    Firebug.Console.logFormatted([msg], context, "info");
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function unmonitor(context, args)
{
    var fn = args[0];
    FunctionMonitor.unmonitorFunction(context, fn, "monitor");
    var msg = Locale.$STRF("functionMonitor.Monitor_removed", [fn.name]);
    Firebug.Console.logFormatted([msg], context, "info");
    return Firebug.Console.getDefaultReturnValue(context.window);
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
