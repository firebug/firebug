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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug.Debugger listener

    onMonitorScript: function(context, frame)
    {
        var stackTrace = StackFrame.buildStackTrace(frame);
        Firebug.Console.log(new FunctionLog(frame, stackTrace), context);
    },

    onFunctionCall: function(context, frame, depth, calling)
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

            if (mode == "debug")
            {
                var location = {line: script.startLine, url: script.url};

                // If the first line of the script contains no code, slide down to
                // the nextline the has runnable code.
                location = DebuggerLib.getNextExecutableLine(context, location);

                // Create a new breakpoint.
                tool.setBreakpoint(context, location.url, location.line - 1,
                function(response, bpClient)
                {
                    BreakpointStore.addBreakpoint(bpClient.location.url,
                        bpClient.location.line - 1);
                });
            }
            else if (mode == "monitor")
            {
                this.monitor(context, scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
            }
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

            if (mode == "debug")
            {
                var location = {line: script.startLine, url: script.url};
                location = DebuggerLib.getNextExecutableLine(context, location);
                BreakpointStore.removeBreakpoint(location.url, location.line - 1);
            }
            else if (mode == "monitor")
            {
                this.unmonitor(context, scriptInfo.sourceFile.href, scriptInfo.lineNo);
            }
        }
    },

    monitor: function(context, sourceFile, lineNo, debuggr)
    {
        // xxxHonza
        return;

        if (lineNo == -1)
            return null;

        var bp = this.addBreakpoint(BP_MONITOR, sourceFile, lineNo, null, debuggr);
        if (bp)
        {
            ++monitorCount;
            dispatch(debuggers, "onToggleMonitor", [sourceFile.href, lineNo, true]);
        }

        return bp;
    },

    unmonitor: function(href, lineNo)
    {
        // xxxHonza
        return;

        if (lineNo != -1 && this.removeBreakpoint(BP_MONITOR, href, lineNo))
        {
            --monitorCount;
            dispatch(debuggers, "onToggleMonitor", [ href, lineNo, false]);
        }
    },
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
        return true;
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
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function undebug(context, args)
{
    var fn = args[0];

    FunctionMonitor.unmonitorFunction(context, fn, "debug");
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function monitor(context, args)
{
    var fn = args[0];

    FunctionMonitor.monitorFunction(context, fn, "monitor");
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function unmonitor(fn)
{
    var fn = args[0];

    FunctionMonitor.unmonitorFunction(context, fn, "monitor");
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
