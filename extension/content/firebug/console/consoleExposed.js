/* See license.txt for terms of usage */
/* jshint strict:false, esnext:true */
/* global define:1, Components:1 */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/lib/string",
    "firebug/lib/url",
    "firebug/lib/wrapper",
    "firebug/chrome/reps",
    "firebug/chrome/tableRep",
    "firebug/console/console",
    "firebug/console/errors",
    "firebug/console/errorMessageObj",
    "firebug/console/commands/profiler",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/debugger/debuggerLib",
    "firebug/dom/domBaseTree",
],
function(Firebug, FBTrace, Locale, Options, Str, Url, Wrapper, FirebugReps, TableRep,
    Console, Errors, ErrorMessageObj, Profiler, StackFrame, StackTrace, DebuggerLib,
    DomBaseTree) {

// Note: since we are using .caller and .arguments for stack walking, we can not use strict mode.
//"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_CONSOLE");

// ********************************************************************************************* //

/**
 * Returns a console object (bundled with passed window through closure), expected to be called
 * into from a web page. The object provides all necessary APIs as described here:
 * https://getfirebug.com/wiki/index.php/Console_API
 *
 * @param {Object} context
 * @param {Object} win
 */
function createFirebugConsole(context, win)
{
    var console = {};

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Exposed Properties

    console.log = function log()
    {
        return logFormatted(arguments, "log");
    };

    console.debug = function debug()
    {
        return logFormatted(arguments, "debug");
    };

    console.info = function info()
    {
        return logFormatted(arguments, "info");
    };

    console.warn = function warn()
    {
        return logFormatted(arguments, "warn");
    };

    console.exception = function exception()
    {
        return logAssert(arguments, "error");
    };

    console.assert = function assert(x)
    {
        if (!x)
        {
            var rest = [];
            for (var i = 1; i < arguments.length; i++)
                rest.push(arguments[i]);

            return logAssert(rest, "assert");
        }

        return Console.getDefaultReturnValue();
    };

    console.dir = function dir(obj)
    {
        ConsoleHandler.dir(context, obj);
        return Console.getDefaultReturnValue();
    };

    console.dirxml = function dirxml(obj)
    {
        ConsoleHandler.dirxml(context, obj);
        return Console.getDefaultReturnValue();
    };

    console.trace = function firebugDebuggerTracer()
    {
        var trace = getJSDUserStack();
        if (!trace)
            trace = getComponentsUserStack();

        ConsoleHandler.trace(context, trace);
        return Console.getDefaultReturnValue();
    };

    console.group = function group()
    {
        ConsoleHandler.group(context, arguments, true, getStackLink());
        return Console.getDefaultReturnValue();
    };

    console.groupCollapsed = function()
    {
        ConsoleHandler.group(context, arguments, false, getStackLink());
        return Console.getDefaultReturnValue();
    };

    console.groupEnd = function()
    {
        ConsoleHandler.groupEnd(context);
        return Console.getDefaultReturnValue();
    };

    console.profile = function(title)
    {
        ConsoleHandler.profile(context, title ? String(title) : null);
        return Console.getDefaultReturnValue();
    };

    console.profileEnd = function()
    {
        ConsoleHandler.profileEnd(context);
        return Console.getDefaultReturnValue();
    };

    console.count = function(key)
    {
        var strKey = (key == null ? "" : String(key));
        ConsoleHandler.count(context, strKey, getStackLink());
        return Console.getDefaultReturnValue();
    };

    console.clear = function()
    {
        ConsoleHandler.clear(context, win);
        return Console.getDefaultReturnValue();
    };

    var timeCounters = new Map();

    console.time = function(name, reset)
    {
        if (!name)
            return Console.getDefaultReturnValue();

        var key = String(name);

        if (!timeCounters.has(key) || reset)
            timeCounters.set(key, win.performance.now());

        return Console.getDefaultReturnValue();
    };

    console.timeEnd = function(name)
    {
        if (!name)
            return Console.getDefaultReturnValue();

        var key = String(name);

        var time = timeCounters.get(key);
        if (time)
        {
            timeCounters.delete(key);

            var diff = win.performance.now() - time;
            ConsoleHandler.timeEnd(context, name, diff, getStackLink());

            return diff;
        }

        return undefined;
    };

    console.timeStamp = function(label)
    {
        if (typeof label !== "string")
            label = "";
        ConsoleHandler.timeStamp(context, label, Date.now());
        return Console.getDefaultReturnValue();
    };

    console.table = function(data, columns)
    {
        ConsoleHandler.table(context, data, columns);
        return Console.getDefaultReturnValue();
    };

    console.error = function error()
    {
        if (arguments.length == 1)
        {
            return logAssert(arguments, "error");
        }
        else
        {
            // XXX(simon) why do we do this? (it breaks the frontend abstraction, too)
            Errors.increaseCount(context);
            return logFormatted(arguments, "error");
        }
    };

    // Expose those properties to the content scope (read only).
    var expose = Object.keys(console);
    console.__exposedProps__ = {};
    for (var i = 0; i < expose.length; i++)
        console.__exposedProps__[expose[i]] = "r";

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers (not accessible from web content)

    function logFormatted(args, className)
    {
        ConsoleHandler.log(context, args, className, getStackLink());
        return Console.getDefaultReturnValue();
    }

    function logAssert(args, category)
    {
        var error = args && args[0];

        var trace;
        var stack = error && error.stack;
        if (typeof stack === "string")
        {
            trace = StackTrace.parseToStackTrace(stack, context);

            Trace.sysout("logAssert trace from error.stack", trace);
        }
        else
        {
            trace = getJSDUserStack();

            Trace.sysout("logAssert trace from getJSDUserStack", trace);

            if (!trace)
            {
                trace = getComponentsUserStack();
                Trace.sysout("logAssert trace from getComponentsUserStack", trace);
            }
        }

        if (!trace || !trace.frames || !trace.frames.length)
            trace = null;

        var fileName = error && error.fileName;
        if (typeof fileName !== "string")
            fileName = win.location.href;

        // we may have only the line popped above
        var lineNo = error && error.lineNumber;
        if (typeof lineNo !== "number" || (lineNo|0) !== lineNo)
            lineNo = 0;

        ConsoleHandler.logError(context, args, category, fileName, lineNo, trace);

        return Console.getDefaultReturnValue();
    }

    function getComponentsStackDump()
    {
        // Starting with our stack, walk back to the user-level code
        var frame = Components.stack;
        var userURL = null;

        if (Trace.active)
        {
            userURL = win.location.href.toString();
            Trace.sysout("consoleExposed.getComponentsStackDump initial stack for userURL " +
                userURL, frame);
        }

        // Drop frames until we get into user code.
        while (frame && Url.isSystemURL(frame.filename))
            frame = frame.caller;

        if (Trace.active)
        {
            Trace.sysout("consoleExposed.getComponentsStackDump final stack for userURL " +
                userURL, frame);
        }

        return frame;
    }

    function getStackLink()
    {
        // Using JSD to get user stack is time consuming, so there is a pref.
        if (Options.get("preferJSDSourceLinks"))
        {
            var stack = getJSDUserStack();
            if (stack && stack.toSourceLink)
                return stack.toSourceLink();
        }

        var sourceLink = StackFrame.getFrameSourceLink(getComponentsStackDump());

        // xxxFlorent: should be reverted if we integrate
        // https://github.com/fflorent/firebug/commit/d5c65e8 (related to issue6268)
        if (sourceLink && DebuggerLib.isFrameLocationEval(sourceLink.href))
            return null;

        return sourceLink;
    }

    function getJSDUserStack()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return null;
        var trace = Firebug.Debugger.getCurrentStackTrace(context);
        return StackFrame.removeChromeFrames(trace);
    }

    function getComponentsUserStack()
    {
        // Walk Components.stack and function.caller/arguments simultaneously.
        var func = arguments.callee;
        var seenFunctions = new Set();
        seenFunctions.add(func);

        var trace = new StackTrace();
        var frame = Components.stack;
        while (frame)
        {
            var fileName = frame.filename;
            if (fileName)
            {
                var frameName = frame.name;
                var args = [];
                if (func)
                {
                    try
                    {
                        if (func.name && func.name !== frameName)
                        {
                            // Something is off, abort!
                            func = null;
                        }
                        else
                        {
                            var argValues = Array.prototype.slice.call(func.arguments);
                            var argNames =
                                StackFrame.guessFunctionArgNamesFromSource(String(func));

                            if (argNames && argNames.length === func.length)
                            {
                                for (var i = 0; i < func.length; i++)
                                    args.push({name: argNames[i], value: argValues[i]});
                            }
                        }
                    }
                    catch (exc)
                    {
                        // strict mode etc.
                    }
                }

                var sframe = new StackFrame({href: fileName},
                    frame.lineNumber, frameName, args, null, null, context);
                trace.frames.push(sframe);
            }

            frame = frame.caller;
            if (func)
            {
                try
                {
                    func = func.caller;
                    if (seenFunctions.has(func))
                    {
                        // Recursion; we cannot go on unfortunately.
                        func = null;
                    }
                    else
                    {
                        seenFunctions.add(func);
                    }
                }
                catch (exc)
                {
                    // Strict mode functions etc.
                    func = null;
                }
            }
        }

        return StackFrame.removeChromeFrames(trace);
    }

    return console;
}

/**
 * Frontend surface of the console API, called into by the console created by createFirebugConsole.
 */
var ConsoleHandler =
{
    log: function(context, args, type, sourceLink)
    {
        Console.logFormatted(args, context, type, false, sourceLink);
    },

    logError: function(context, args, type, fileName, lineNo, trace)
    {
        var msg = args.length ? args[0] : [Locale.$STR("Assertion")];
        var errorObject = new ErrorMessageObj(msg, fileName, lineNo, null, type, context, trace);

        if (trace)
            errorObject.correctWithStackTrace(trace);
        errorObject.resetSource();

        var otherArgs = [].slice.call(args, 1);
        if (otherArgs.length)
            errorObject.objects = otherArgs;

        Errors.increaseCount(context);
        Console.log(errorObject, context, "errorMessage");
    },

    trace: function(context, trace)
    {
        // This should never happen, but inform the user if it does.
        if (!trace)
            trace = "(No stack trace available)";

        Console.log(trace, context, "stackTrace");
    },

    dir: function(context, obj)
    {
        Console.log(obj, context, "dir", null, false, null, function(row)
        {
            var logContent = row.getElementsByClassName("logContent").item(0);
            var tree = new DomBaseTree(context);
            tree.replace(logContent, {object: obj}, true);
        });
    },

    dirxml: function(context, obj)
    {
        if (obj instanceof Window)
            obj = obj.document.documentElement;
        else if (obj instanceof Document)
            obj = obj.documentElement;

        Console.log(obj, context, "dirxml", Firebug.HTMLPanel.SoloElement);
    },

    count: function(context, strKey, sourceLink)
    {
        var id;
        if (strKey)
            id = "/" + strKey;
        else if (sourceLink)
            id = "#" + sourceLink.href + "/" + sourceLink.line;
        else
            return;

        if (!context.frameCounters)
            context.frameCounters = {};
        if (!context.frameCounters[id])
        {
            var row = Console.logFormatted(["0"], context, null, true, sourceLink);
            context.frameCounters[id] = {logRow: row, count: 0};
        }

        var frameCounter = context.frameCounters[id];
        frameCounter.count++;

        var label = (strKey ? strKey + " " : "") + frameCounter.count;

        var node = frameCounter.logRow.getElementsByClassName("objectBox-text")[0];
        node.firstChild.nodeValue = label;
    },

    group: function(context, args, open, sourceLink)
    {
        if (open)
            Console.openGroup(args, null, "group", null, false, sourceLink);
        else
            Console.openCollapsedGroup(args, null, "group", null, false, sourceLink);
    },

    groupEnd: function(context)
    {
        Console.closeGroup(context);
    },

    clear: function(context, win)
    {
        Console.clear(context);
    },

    timeEnd: function(context, name, diff, sourceLink)
    {
        var label = name + ": " + diff.toFixed(2) + "ms";

        Console.logFormatted([label], context, "info", false, sourceLink);
    },

    timeStamp: function(context, label, time)
    {
        Trace.sysout("consoleExposed.timeStamp; " + label);

        Firebug.NetMonitor.addTimeStamp(context, time, label);

        var date = new Date(time);
        var formattedTime = date.getHours() + ":" + date.getMinutes() + ":" +
            date.getSeconds() + "." + date.getMilliseconds();

        Console.logFormatted([formattedTime, label], context, "timeStamp");
    },

    table: function(context, data, columns)
    {
        TableRep.log(data, columns, context);
    },

    profile: function(context, title)
    {
        Profiler.commandLineProfileStart(context, title);
    },

    profileEnd: function(context)
    {
        Profiler.commandLineProfileEnd(context);
    },
};

// ********************************************************************************************* //
// Registration

Firebug.ConsoleExposed =
{
    createFirebugConsole: createFirebugConsole,
    ConsoleHandler: ConsoleHandler,
};

return Firebug.ConsoleExposed;

// ********************************************************************************************* //
});
