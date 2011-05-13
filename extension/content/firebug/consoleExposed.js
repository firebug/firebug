/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/lib/stackFrame",
    "firebug/errors",
],
function(FBL, FirebugReps, Locale, Wrapper, URL, StackFrame) {

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
        return logFormatted(arguments, "log");
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

        return "_firebugIgnore";
    };

    console.dir = function dir(o)
    {
        Firebug.Console.log(o, context, "dir", Firebug.DOMPanel.DirTable);
        return "_firebugIgnore";
    };

    console.dirxml = function dirxml(o)
    {
        if (o instanceof Wrapper.getContentView(win).Window)
            o = o.document.documentElement;
        else if (o instanceof Wrapper.getContentView(win).Document)
            o = o.documentElement;

        Firebug.Console.log(o, context, "dirxml", Firebug.HTMLPanel.SoloElement);
        return "_firebugIgnore";
    };

    console.trace = function firebugDebuggerTracer()
    {
        var unwrapped = Wrapper.unwrapObject(win);
        unwrapped.top._firebugStackTrace = "console-tracer";
        debugger;
        delete unwrapped.top._firebugStackTrace;

        return "_firebugIgnore";
    };

    console.group = function group()
    {
        var sourceLink = getStackLink();
        Firebug.Console.openGroup(arguments, null, "group", null, false, sourceLink);
        return "_firebugIgnore";
    };

    console.groupEnd = function()
    {
        Firebug.Console.closeGroup(context);
        return "_firebugIgnore";
    };

    console.groupCollapsed = function()
    {
        var sourceLink = getStackLink();

        // noThrottle true can't be used here (in order to get the result row now)
        // because there can be some logs delayed in the queue and they would end up
        // in a different grup.
        // Use rather a different method that causes auto collapsing of the group
        // when it's created.
        Firebug.Console.openCollapsedGroup(arguments, null, "group", null, false, sourceLink);
        return "_firebugIgnore";
    };

    console.profile = function(title)
    {
        Firebug.Profiler.startProfiling(context, title);
        return "_firebugIgnore";
    };

    console.profileEnd = function()
    {
        Firebug.Profiler.stopProfiling(context);
        return "_firebugIgnore";
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
                ++frameCounter.count;

            var label = key == undefined
                ? frameCounter.count
                : key + " " + frameCounter.count;

            frameCounter.logRow.firstChild.firstChild.nodeValue = label;
        }
        return "_firebugIgnore";
    };

    console.clear = function()
    {
        Firebug.Console.clear(context);
        return "_firebugIgnore";
    };

    console.time = function(name, reset)
    {
        if (!name)
            return "_firebugIgnore";

        var time = new Date().getTime();

        if (!this.timeCounters)
            this.timeCounters = {};

        var key = "KEY"+name.toString();

        if (!reset && this.timeCounters[key])
            return "_firebugIgnore";

        this.timeCounters[key] = time;
        return "_firebugIgnore";
    };

    console.timeEnd = function(name)
    {
        var time = new Date().getTime();

        if (!this.timeCounters)
            return "_firebugIgnore";

        var key = "KEY"+name.toString();

        var timeCounter = this.timeCounters[key];
        if (timeCounter)
        {
            var diff = time - timeCounter;
            var label = name + ": " + diff + "ms";

            this.info(label);

            delete this.timeCounters[key];
        }
        return diff;
    };

    console.table = function(data, columns)
    {
        FirebugReps.Table.log(data, columns, context);
        return "_firebugIgnore";
    };

    console.error = function error()
    {
        // TODO stack trace
        if (arguments.length == 1)
        {
            return logAssert("error", arguments);  // add more info based on stack trace
        }
        else
        {
            Firebug.Errors.increaseCount(context);
            return logFormatted(arguments, "error", true);  // user already added info
        }
    };

    console.memoryProfile = function(title)
    {
        Firebug.MemoryProfiler.start(context, title);
        return "_firebugIgnore";
    };

    console.memoryProfileEnd = function()
    {
        Firebug.MemoryProfiler.stop(context);
        return "_firebugIgnore";
    };

    console.firebug = Firebug.version;

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
    console.__exposedProps__.profile = "r";
    console.__exposedProps__.profileEnd = "r";
    console.__exposedProps__.count = "r";
    console.__exposedProps__.clear = "r";
    console.__exposedProps__.table = "r";
    console.__exposedProps__.error = "r";
    console.__exposedProps__.firebug = "r";
    console.__exposedProps__.memoryProfile = "r";
    console.__exposedProps__.memoryProfileEnd = "r";
    // DBG console.uid = Math.random();

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers (not accessible from web content)

    function logFormatted(args, className, linkToSource, noThrottle)
    {
        var sourceLink = linkToSource ? getStackLink() : null;
        var rc = Firebug.Console.logFormatted(args, context, className, noThrottle, sourceLink);
        return rc ? rc : "_firebugIgnore";
    };

    function logAssert(category, args)
    {
        Firebug.Errors.increaseCount(context);

        if (!args || !args.length || args.length == 0)
            var msg = [Locale.$STR("Assertion")];
        else
            var msg = args[0];

        if (msg.stack)
        {
            var trace = StackFrame.parseToStackTrace(msg.stack, context);
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("logAssert trace from msg.stack", trace);
        }
        else if (context.stackTrace)
        {
            var trace = context.stackTrace
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("logAssert trace from context.window.stackTrace", trace);
        }
        else
        {
            var trace = getJSDUserStack();
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("logAssert trace from getJSDUserStack", trace);
        }

        trace = StackFrame.cleanStackTraceOfFirebug(trace);

        var url = msg.fileName ? msg.fileName : win.location.href;
        var lineNo = (trace && msg.lineNumber) ? msg.lineNumber : 0; // we may have only the line popped above
        var errorObject = new FirebugReps.ErrorMessageObj(msg, url, lineNo, "", category, context, trace);

        if (trace && trace.frames && trace.frames[0])
           errorObject.correctWithStackTrace(trace);

        errorObject.resetSource();

        if (args.length > 1)
        {
            errorObject.objects = []
            for (var i = 1; i < args.length; i++)
                errorObject.objects.push(args[i]);
        }

        var row = Firebug.Console.log(errorObject, context, "errorMessage");
        if (row)
            row.scrollIntoView();

        return "_firebugIgnore";
    };

    function getComponentsStackDump()
    {
        // Starting with our stack, walk back to the user-level code
        var frame = Components.stack;
        var userURL = win.location.href.toString();

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.getComponentsStackDump initial stack for userURL "+userURL, frame);

        // Drop frames until we get into user code.
        while (frame && URL.isSystemURL(frame.filename) )
            frame = frame.caller;

        // Drop two more frames, the injected console function and firebugAppendConsole()
        //if (frame)
        //    frame = frame.caller;
        //if (frame)
        //    frame = frame.caller;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.getComponentsStackDump final stack for userURL "+userURL, frame);

        return frame;
    };

    function getStackLink()
    {
        return StackFrame.getFrameSourceLink(getComponentsStackDump());
    };

    function getJSDUserStack()
    {
        var trace = Firebug.Debugger.getCurrentStackTrace(context);

        var frames = trace ? trace.frames : null;
        if (frames && (frames.length > 0) )
        {
            var oldest = frames.length - 1;  // 6 - 1 = 5
            for (var i = 0; i < frames.length; i++)
            {
                if (frames[oldest - i].href.indexOf("chrome:") == 0)
                    break;

                // firebug-service scope reached, in some cases the url starts with file://
                if (frames[oldest - i].href.indexOf("modules/firebug-service.js") != -1)
                    break;

                // command line
                var fn = frames[oldest - i].getFunctionName() + "";
                if (fn && (fn.indexOf("_firebugEvalEvent") != -1))
                    break;
            }

            // take the oldest frames, leave 2 behind they are injection code
            trace.frames = trace.frames.slice(2 - i);

            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("consoleInjector getJSDUserStack: "+frames.length+" oldest: "+
                    oldest+" i: "+i+" i - oldest + 2: "+(i - oldest + 2), trace.toString().split('\n'));

            return trace;
        }
        else
        {
            return "Firebug failed to get stack trace with any frames";
        }
    };

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
    };

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
