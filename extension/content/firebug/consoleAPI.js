/* See license.txt for terms of usage */

function FirebugConsole(context, win)
{
    this.firebug = Firebug.version;

    // We store these functions as closures so that they can access the context privately,
    // because it would be insecure to store context as a property of window.console and
    // and therefore expose it to web pages.

    this.log = function()
    {
        logFormatted(arguments, "log");
    };

    this.debug = function()
    {
        logFormatted(arguments, "debug", true);
    };

    this.info = function()
    {
        logFormatted(arguments, "info", true);
    };

    this.warn = function()
    {
        logFormatted(arguments, "warn", true);
    };

    this.error = function()
    {
        Firebug.Errors.increaseCount(context);
        logFormatted(arguments, "error", true);
    };

    this.assert = function(x)
    {
        if (!x)
            logAssert(FBL.sliceArray(arguments, 1), ["%o", x]);
    };

    this.dir = function(o)
    {
        Firebug.Console.log(o, context, "dir", Firebug.DOMPanel.DirTable);
    };

    this.dirxml = function(o)
    {
        if (o instanceof Window)
            o = o.document.documentElement;
        else if (o instanceof Document)
            o = o.documentElement;

        Firebug.Console.log(o, context, "dirxml", Firebug.HTMLPanel.SoloElement);
    };

    this.trace = function()
    {
        var trace = FBL.getCurrentStackTrace(context);
        Firebug.Console.log(trace, context, "stackTrace");
    };

    this.group = function()
    {
        var sourceLink = FBL.getStackSourceLink(Components.stack);
        Firebug.Console.openGroup(arguments, null, "group", null, false, sourceLink);
    };

    this.groupEnd = function()
    {
        Firebug.Console.closeGroup(context);
    };

    this.time = function(name, reset)
    {
        if (!name)
            return;

        var time = new Date().getTime();

        if (!context.timeCounters)
            context.timeCounters = {};

        if (!reset && context.timeCounters.hasOwnProperty(name))
            return;

        context.timeCounters[name] = time;
    };

    this.timeEnd = function(name)
    {
        var time = new Date().getTime();

        if (!context.timeCounters)
            return;

        var timeCounter = context.timeCounters[name];
        if (timeCounter)
        {
            var diff = time - timeCounter;
            var label = name + ": " + diff + "ms";

            logFormatted([label], null, true);

            delete context.timeCounters[name];
        }
    };

    this.profile = function(title)
    {
        Firebug.Profiler.startProfiling(context, title);
    };

    this.profileEnd = function()
    {
        Firebug.Profiler.stopProfiling(context);
    };

    this.count = function(key)
    {
        var frameId = FBL.getStackFrameId();
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
    };

/*
    this.addTab = function(url, title, parentPanel)
    {
        context.chrome.addTab(context, url, title, parentPanel);
    };

    this.removeTab = function(url)
    {
        context.chrome.removeTab(context, url);
    };
*/

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    function logFormatted(args, className, linkToSource, noThrottle)
    {
        var sourceLink = linkToSource ? FBL.getStackSourceLink(Components.stack) : null;
        return Firebug.Console.logFormatted(args, context, className, noThrottle, sourceLink);
    }

    function logAssert(args, description)
    {
        Firebug.Errors.increaseCount(context);

        if (!args || !args.length)
            args = [FBL.$STR("Assertion")];

        var sourceLink = FBL.getStackSourceLink(Components.stack);
        var row = Firebug.Console.log(null, context, "assert", FirebugReps.Assert, true, sourceLink);

        var argsRow = row.firstChild.firstChild;
        Firebug.Console.appendFormatted(args, argsRow, context);

        var descRow = argsRow.nextSibling;
        Firebug.Console.appendFormatted(description, descRow, context);

        row.scrollIntoView();
    }
}
