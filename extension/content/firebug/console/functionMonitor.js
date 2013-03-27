/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/script/sourceFile",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointStore",
],
function(FBTrace, Obj, Domplate, Reps, StackFrame, SourceFile, Events, Css, Dom,
    Url, Locale, DebuggerLib, BreakpointStore) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_FUNCTIONMONITOR");

// ********************************************************************************************* //
// Function Monitor

var FunctionMonitor = Obj.extend(Firebug.Module,
{
    dispatchName: "functionMonitor",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);
        Firebug.connection.addListener(this);
    },

    shutdown: function()
    {
        Firebug.connection.removeListener(this);
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

    onDebuggerPaused: function(context, event, packet)
    {
        // The function monitor is only interested in 'breakpoint' type of interrupts.
        var type = packet.why.type;
        if (type != "breakpoint")
            return false;

        var frame = context.stoppedFrame;
        var bp = BreakpointStore.findBreakpoint(frame.href, frame.line - 1,
            BreakpointStore.BP_MONITOR);

        Trace.sysout("functionMonitor.onDebuggerPaused; " + frame.href + " (" +
            frame.line + ") " + (bp ? "monitor exists" : "no monitor"), packet);

        if (!bp)
            return false;

        // Log into the Console panel if there is a monitor.
        this.onMonitorScript(context, frame);

        // Let's see if there is also a standard breakpoint. If yes, make sure the
        // debugger breaks (by returning false).
        bp = BreakpointStore.findBreakpoint(frame.href, frame.line - 1);
        if (bp)
        {
            Trace.sysout("functionMonitor.onDebuggerPaused; There is also a normal BP", bp);
            return false;
        }

        // ... otherwise do not break and just resume the debugger.
        return true;
    },

    onMonitorScript: function(context, frame)
    {
        Trace.sysout("functionMonitor.onMonitorScript;", frame);

        // xxxHonza: how to get the current stack trace?
        var stackTrace = null;//StackFrame.buildStackTrace(frame);
        Firebug.Console.log(new FunctionLog(frame, stackTrace), context);
    },

    /*onFunctionCall: function(context, frame, depth, calling)
    {
        //var url = Url.normalizeURL(frame.script.fileName);
        //var sourceFile = context.sourceFileMap[url];
        // Firebug.errorStackTrace = StackFrame.getCorrectedStackTrace(frame, context);
        //var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        if (Url.isSystemURL(Url.normalizeURL(frame.script.fileName)))
            return;

        // xxxHonza: traceCall and traceCallAll need to be fixed yet.
        FBTrace.sysout("functionMonitor.onFunctionCall; ", sourceFile);

        if (calling)
            Firebug.Console.openGroup([frame, "depth:" + depth], context);
        else
            Firebug.Console.closeGroup(context);
    },*/

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging and monitoring

    monitorFunction: function(context, fn, mode)
    {
        if (typeof(fn) == "function")
        {
            var script = SourceFile.findScriptForFunctionInContext(context, fn);
            if (script)
            {
                this.monitorScript(context, fn, script, mode);
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
                this.unmonitorScript(context, fn, script, mode);
        }
    },

    monitorScript: function(context, fn, script, mode)
    {
        var tool = context.getTool("debugger");
        var script = SourceFile.findScriptForFunctionInContext(context, fn);
        if (script)
        {
            Trace.sysout("functionMonitor.monitorScript; " + script.url + ", " +
                script.startLine, fn);

            var location = {line: script.startLine, url: script.url};

            // If the first line of the script contains no code, slide down to
            // the nextline the has runnable code.
            location = DebuggerLib.getNextExecutableLine(context, location);

            // Create a new breakpoint.
            tool.setBreakpoint(context, location.url, location.line - 1,
            function(response, bpClient)
            {
                var type = (mode == "monitor") ? BreakpointStore.BP_MONITOR :
                    BreakpointStore.BP_NORMAL;

                BreakpointStore.addBreakpoint(bpClient.location.url,
                    bpClient.location.line - 1, type);
            });
        }
    },

    unmonitorScript: function(context, fn, script, mode)
    {
        var tool = context.getTool("debugger");
        var script = SourceFile.findScriptForFunctionInContext(context, fn);
        if (script)
        {
            Trace.sysout("functionMonitor.unmonitorScript; " + script.url + ", " +
                script.startLine, fn);

            var location = {line: script.startLine, url: script.url};
            location = DebuggerLib.getNextExecutableLine(context, location);

            var type = (mode == "monitor") ? BreakpointStore.BP_MONITOR :
                BreakpointStore.BP_NORMAL;

            BreakpointStore.removeBreakpoint(location.url, location.line - 1, type);
        }
    },

    // xxxHonza: this will be needed for the context menu.
    isMonitored: function(url, linNo)
    {
        var bp = lineNo != -1 ? BreakpointStore.findBreakpoint(url, lineNo) : null;
        return bp && bp.type & BreakpointStore.BP_MONITOR;
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

var FunctionMonitorRep = domplate(Firebug.Rep,
{
    className: "functionCall",

    tag:
        Reps.OBJECTBLOCK({$hasTwisty: "$object|hasStackTrace", _repObject: "$object",
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
        return Reps.StackFrame.getSourceLink(object.frame);
    },

    getSourceLinkTitle: function(object)
    {
        return Reps.StackFrame.getSourceLinkTitle(object.frame);
    },

    argIterator: function(object)
    {
        return Reps.StackFrame.argIterator(object.frame);
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
            Reps.StackTrace.tag.append({object: functionCall.stackTrace}, traceBox);
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
}});
