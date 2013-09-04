/* See license.txt for terms of usage */

define([
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/lib/string",
    "firebug/js/stackFrame",
    "firebug/console/errors",
    "firebug/trace/debug",
    "firebug/console/console",
    "firebug/lib/options",
    "firebug/debugger/debuggerLib",
],
function(FirebugReps, Locale, Wrapper, Url, Str, StackFrame, Errors, Debug, Console, Options,
    DebuggerLib) {

// Note: since we are using .caller and .arguments for stack walking, we can not use strict mode.
//"use strict";

// ********************************************************************************************* //

/**
 * Returns a console object (bundled with passed window through closure). The object
 * provides all necessary APIs as described here: http://getfirebug.com/wiki/index.php/Console_API
 *
 * @param {Object} context
 * @param {Object} win
 */
function createFirebugConsole(context, win)
{
    // Defined as a chrome object, but exposed into the web content scope.
    var console = {
        __exposedProps__: {}
    };

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Exposed Properties

    console.log = function log()
    {
        return logFormatted(arguments, "log", true);
    };

    console.debug = function debug()
    {
        return logFormatted(arguments, "debug", true);
    };

    console.info = function info()
    {
        return logFormatted(arguments, "info", true);
    };

    console.warn = function warn()
    {
        return logFormatted(arguments, "warn", true);
    };

    console.exception = function exception()
    {
        return logAssert("error", arguments);
    };

    console.assert = function assert(x)
    {
        if (!x)
        {
            var rest = [];
            for (var i = 1; i < arguments.length; i++)
                rest.push(arguments[i]);
            return logAssert("assert", rest);
        }

        return Console.getDefaultReturnValue();
    };

    console.dir = function dir(o)
    {
        Firebug.Console.log(o, context, "dir", Firebug.DOMPanel.DirTable);
        return Console.getDefaultReturnValue();
    };

    console.dirxml = function dirxml(o)
    {
        if (o instanceof Wrapper.getContentView(win).Window)
            o = o.document.documentElement;
        else if (o instanceof Wrapper.getContentView(win).Document)
            o = o.documentElement;

        Firebug.Console.log(o, context, "dirxml", Firebug.HTMLPanel.SoloElement);
        return Console.getDefaultReturnValue();
    };

    console.trace = function firebugDebuggerTracer()
    {
        var trace = getJSDUserStack();
        if (!trace)
            trace = getComponentsUserStack();

        // This should never happen, but inform the user if it does.
        if (!trace)
            trace = "(No stack trace available)";

        Firebug.Console.log(trace, context, "stackTrace");
        return Console.getDefaultReturnValue();
    };

    console.group = function group()
    {
        var sourceLink = getStackLink();
        Firebug.Console.openGroup(arguments, null, "group", null, false, sourceLink);
        return Console.getDefaultReturnValue();
    };

    console.groupEnd = function()
    {
        Firebug.Console.closeGroup(context);
        return Console.getDefaultReturnValue();
    };

    console.groupCollapsed = function()
    {
        var sourceLink = getStackLink();

        // noThrottle true can't be used here (in order to get the result row now)
        // because there can be some logs delayed in the queue and they would end up
        // in a different group.
        // Use rather a different method that causes auto collapsing of the group
        // when it's created.
        Firebug.Console.openCollapsedGroup(arguments, null, "group", null, false, sourceLink);
        return Console.getDefaultReturnValue();
    };

    console.profile = function(title)
    {
        Firebug.Profiler.commandLineProfileStart(context, title);
        return Console.getDefaultReturnValue();
    };

    console.profileEnd = function()
    {
        Firebug.Profiler.commandLineProfileEnd(context);
        return Console.getDefaultReturnValue();
    };

    console.count = function(key)
    {
        var frameId = getStackFrameId();
        if (frameId)
        {
            if (!context.frameCounters)
                context.frameCounters = {};

            if (key != undefined)
                frameId += key;

            var frameCounter = context.frameCounters[frameId];
            if (!frameCounter)
            {
                var logRow = logFormatted(["0"], null, true, true);

                frameCounter = {logRow: logRow, count: 1};
                context.frameCounters[frameId] = frameCounter;
            }
            else
            {
                ++frameCounter.count;
            }

            var label = key == undefined
                ? frameCounter.count
                : key + " " + frameCounter.count;

            var node = frameCounter.logRow.getElementsByClassName("objectBox-text")[0];
            node.firstChild.nodeValue = label;
        }
        return Console.getDefaultReturnValue();
    };

    console.clear = function()
    {
        Firebug.Console.clear(context);
        return Console.getDefaultReturnValue();
    };

    console.time = function(name, reset)
    {
        if (!name)
            return Console.getDefaultReturnValue();

        var time = new Date().getTime();

        if (!this.timeCounters)
            this.timeCounters = {};

        var key = "KEY"+name.toString();

        if (!reset && this.timeCounters[key])
            return Console.getDefaultReturnValue();

        this.timeCounters[key] = time;
        return Console.getDefaultReturnValue();
    };

    console.timeEnd = function(name)
    {
        var time = new Date().getTime();
        var diff = undefined;

        if (!this.timeCounters)
            return Console.getDefaultReturnValue();

        var key = "KEY"+name.toString();

        var timeCounter = this.timeCounters[key];
        if (timeCounter)
        {
            diff = time - timeCounter;
            var label = name + ": " + diff + "ms";

            this.info(label);

            delete this.timeCounters[key];
        }
        return diff;
    };

    console.timeStamp = function(label)
    {
        label = label || "";

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleExposed.timeStamp; " + label);

        var now = new Date();
        Firebug.NetMonitor.addTimeStamp(context, now.getTime(), label);

        var formattedTime = now.getHours() + ":" + now.getMinutes() + ":" +
            now.getSeconds() + "." + now.getMilliseconds();
        return logFormatted([formattedTime, label], "timeStamp");
    };

    console.table = function(data, columns)
    {
        FirebugReps.Table.log(data, columns, context);
        return Console.getDefaultReturnValue();
    };

    console.error = function error()
    {
        if (arguments.length == 1)
        {
            return logAssert("error", arguments);  // add more info based on stack trace
        }
        else
        {
            Errors.increaseCount(context);
            return logFormatted(arguments, "error", true);  // user already added info
        }
    };

    // Expose only these properties to the content scope (read only).
    console.__exposedProps__.log = "r";
    console.__exposedProps__.debug = "r";
    console.__exposedProps__.info = "r";
    console.__exposedProps__.warn = "r";
    console.__exposedProps__.exception = "r";
    console.__exposedProps__.assert = "r";
    console.__exposedProps__.dir = "r";
    console.__exposedProps__.dirxml = "r";
    console.__exposedProps__.trace = "r";
    console.__exposedProps__.group = "r";
    console.__exposedProps__.groupEnd = "r";
    console.__exposedProps__.groupCollapsed = "r";
    console.__exposedProps__.time = "r";
    console.__exposedProps__.timeEnd = "r";
    console.__exposedProps__.timeStamp = "r";
    console.__exposedProps__.profile = "r";
    console.__exposedProps__.profileEnd = "r";
    console.__exposedProps__.count = "r";
    console.__exposedProps__.clear = "r";
    console.__exposedProps__.table = "r";
    console.__exposedProps__.error = "r";

    // DBG console.uid = Math.random();

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers (not accessible from web content)

    function logFormatted(args, className, linkToSource, noThrottle)
    {
        var sourceLink = null;

        // Using JSD to get user stack is time consuming, so there is a pref.
        if (Options.get("preferJSDSourceLinks"))
        {
            var stack = getJSDUserStack();
            if (stack && stack.toSourceLink)
                sourceLink = stack.toSourceLink();
        }

        if (!sourceLink)
            sourceLink = linkToSource ? getStackLink() : null;

        var ignoreReturnValue = Firebug.Console.getDefaultReturnValue();
        var rc = Firebug.Console.logFormatted(args, context, className, noThrottle, sourceLink);
        return rc ? rc : ignoreReturnValue;
    }

    function logAssert(category, args)
    {
        Errors.increaseCount(context);

        var msg = (!args || !args.length || args.length == 0) ?
            [Locale.$STR("Assertion")] : args[0];

        // If there's no error message, there's also no stack trace. See Issue 4700.
        var trace;
        if (msg && msg.stack)
        {
            trace = StackFrame.parseToStackTrace(msg.stack, context);
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("logAssert trace from msg.stack", trace);
        }
        else
        {
            trace = getJSDUserStack();
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("logAssert trace from getJSDUserStack", trace);

            if (!trace)
            {
                trace = getComponentsUserStack();
                if (FBTrace.DBG_CONSOLE)
                    FBTrace.sysout("logAssert trace from getComponentsUserStack", trace);
            }
        }

        trace = StackFrame.cleanStackTraceOfFirebug(trace);

        var url = msg && msg.fileName ? msg.fileName : win.location.href;

        // we may have only the line popped above
        var lineNo = (trace && msg && msg.lineNumber) ? msg.lineNumber : 0;
        var errorObject = new FirebugReps.ErrorMessageObj(msg, url, lineNo, "",
            category, context, trace);

        if (trace && trace.frames && trace.frames[0])
            errorObject.correctWithStackTrace(trace);

        errorObject.resetSource();

        if (args.length > 1)
        {
            errorObject.objects = [];
            for (var i = 1; i < args.length; i++)
                errorObject.objects.push(args[i]);
        }

        var row = Firebug.Console.log(errorObject, context, "errorMessage");
        if (row)
            row.scrollIntoView();

        return Console.getDefaultReturnValue();
    }

    function getComponentsStackDump()
    {
        // Starting with our stack, walk back to the user-level code
        var frame = Components.stack;
        var userURL = win.location.href.toString();

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.getComponentsStackDump initial stack for userURL " +
                userURL, frame);

        // Drop frames until we get into user code.
        while (frame && Url.isSystemURL(frame.filename) )
            frame = frame.caller;

        // Drop two more frames, the injected console function and firebugAppendConsole()
        //if (frame)
        //    frame = frame.caller;
        //if (frame)
        //    frame = frame.caller;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.getComponentsStackDump final stack for userURL " +
                userURL, frame);

        return frame;
    }

    function getStackLink()
    {
        var sourceLink = StackFrame.getFrameSourceLink(getComponentsStackDump());
        // xxxFlorent: should be reverted if we integrate 
        // https://github.com/fflorent/firebug/commit/d5c65e8 (related to issue6268)
        if (DebuggerLib.isFrameLocationEval(sourceLink.href))
            return null;
        return sourceLink;
    }

    function removeChromeFrames(trace)
    {
        var frames = trace ? trace.frames : null;
        if (!frames || !frames.length)
            return null;

        var filteredFrames = [];
        for (var i = 0; i < frames.length; i++)
        {
            if (Str.hasPrefix(frames[i].href, "chrome:"))
                continue;

            if (Str.hasPrefix(frames[i].href, "resource:"))
                continue;

            // firebug-service scope reached, in some cases the url starts with file://
            if (frames[i].href.indexOf("modules/firebug-service.js") != -1)
                continue;

            // xxxFlorent: should be reverted if we integrate
            // https://github.com/fflorent/firebug/commit/d5c65e8 (related to issue6268)
            if (DebuggerLib.isFrameLocationEval(frames[i].href))
                continue;

            // command line
            var fn = frames[i].getFunctionName() + "";
            if (fn && (fn.indexOf("_firebugEvalEvent") != -1))
                continue;

            filteredFrames.push(frames[i]);
        }

        trace.frames = filteredFrames;

        return trace;
    }

    function getJSDUserStack()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return null;
        var trace = Firebug.Debugger.getCurrentStackTrace(context);
        return removeChromeFrames(trace);
    }

    function getComponentsUserStack()
    {
        // Walk Components.stack and function.caller/arguments simultaneously.
        var func = arguments.callee;
        var seenFunctions = new Set();
        seenFunctions.add(func);

        var trace = new StackFrame.StackTrace();
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
                            var argNames = StackFrame.guessFunctionArgNamesFromSource(func + "");
                            if (argNames && argNames.length === func.length)
                            {
                                for (var i = 0; i < func.length; i++)
                                    args.push({name: argNames[i], value: argValues[i]});
                            }
                        }
                    }
                    catch (exc) {} // strict mode etc.
                }

                var sframe = new StackFrame.StackFrame({href: fileName},
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

        return removeChromeFrames(trace);
    }

    function getStackFrameId(inputFrame)
    {
        for (var frame = Components.stack; frame; frame = frame.caller)
        {
            if (frame.languageName == "JavaScript"
                && !(frame.filename && frame.filename.indexOf("://firebug/") > 0))
            {
                return frame.filename + "/" + frame.lineNumber;
            }
        }
        return null;
    }

    return console;
}

// ********************************************************************************************* //
// Registration

Firebug.ConsoleExposed =
{
    createFirebugConsole: createFirebugConsole
};

return Firebug.ConsoleExposed;

// ********************************************************************************************* //
});
