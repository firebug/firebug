/* See license.txt for terms of usage */

//
FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

top.Firebug.Console.injector =
{
    isAttached: function(context, win)
    {
        if (win.wrappedJSObject)
        {
            var attached = (win.wrappedJSObject._getFirebugConsoleElement ? true : false);
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("Console.isAttached:"+attached+" to win.wrappedJSObject "+safeGetWindowLocation(win.wrappedJSObject));

            return attached;
        }
        else
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("Console.isAttached? to win "+win.location+" fnc:"+win._getFirebugConsoleElement);
            return (win._getFirebugConsoleElement ? true : false);
        }
    },

    attachIfNeeded: function(context, win)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.attachIfNeeded has win "+(win? ((win.wrappedJSObject?"YES":"NO")+" wrappedJSObject"):"null") );

        if (this.isAttached(context, win))
            return true;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.attachIfNeeded found isAttached false ");

        this.attachConsoleInjector(context, win);
        this.addConsoleListener(context, win);

        if (context.consoleWarning)
        {
            Firebug.Console.clear(context); // remove the warning about reloading.
            delete context.consoleWarning;
        }

        var attached =  this.isAttached(context, win);
        if (attached)
            dispatch(Firebug.Console.fbListeners, "onConsoleInjected", [context, win]);

        return attached;
    },

    attachConsoleInjector: function(context, win)
    {
        var consoleInjection = this.getConsoleInjectionScript();  // Do it all here.

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("attachConsoleInjector evaluating in "+win.location, consoleInjection);

        Firebug.CommandLine.evaluateInWebPage(consoleInjection, context, win);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("attachConsoleInjector evaluation completed for "+win.location);
    },

    getConsoleInjectionScript: function() {
        if (!this.consoleInjectionScript)
        {
            var script = "";
            script += "window.__defineGetter__('console', function() {\n";
            script += " return (window._firebug ? window._firebug : window.loadFirebugConsole()); })\n\n";

            script += "window.loadFirebugConsole = function() {\n";
            script += "window._firebug =  new _FirebugConsole();";

            if (FBTrace.DBG_CONSOLE)
                script += " window.dump('loadFirebugConsole '+window.location+'\\n');\n";

            script += " return window._firebug };\n";

            var theFirebugConsoleScript = getResource("chrome://firebug/content/consoleInjected.js");
            script += theFirebugConsoleScript;


            this.consoleInjectionScript = script;
        }
        return this.consoleInjectionScript;
    },

    forceConsoleCompilationInPage: function(context, win)
    {
        if (!win)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("no win in forceConsoleCompilationInPage!");
            return;
        }

        var consoleForcer = "window.loadFirebugConsole();";

        if (context.stopped)
            Firebug.Console.injector.evaluateConsoleScript(context);  // todo evaluate consoleForcer on stack
        else
            Firebug.CommandLine.evaluateInWebPage(consoleForcer, context, win);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("forceConsoleCompilationInPage "+win.location, consoleForcer);
    },

    evaluateConsoleScript: function(context)
    {
        var scriptSource = this.getConsoleInjectionScript(); // TODO XXXjjb this should be getConsoleInjectionScript
        Firebug.Debugger.evaluate(scriptSource, context);
    },

    addConsoleListener: function(context, win)
    {
        if (!context.activeConsoleHandlers)  // then we have not been this way before
            context.activeConsoleHandlers = [];
        else
        {   // we've been this way before...
            for (var i=0; i<context.activeConsoleHandlers.length; i++)
            {
                if (context.activeConsoleHandlers[i].window == win)
                {
                    context.activeConsoleHandlers[i].detach();
                    if (FBTrace.DBG_CONSOLE)
                        FBTrace.sysout("consoleInjector addConsoleListener removed handler("+context.activeConsoleHandlers[i].handler_name+") from _firebugConsole in : "+win.location+"\n");
                    context.activeConsoleHandlers.splice(i,1);
                }
            }
        }

        // We need the element to attach our event listener.
        var element = Firebug.Console.getFirebugConsoleElement(context, win);
        if (element)
            element.setAttribute("FirebugVersion", Firebug.version); // Initialize Firebug version.
        else
            return false;

        var handler = new FirebugConsoleHandler(context, win);
        handler.attachTo(element);

        context.activeConsoleHandlers.push(handler);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector addConsoleListener attached handler("+handler.handler_name+") to _firebugConsole in : "+win.location+"\n");
        return true;
    },

    detachConsole: function(context, win)
    {
        var element = win.document.getElementById("_firebugConsole");
        if (element)
            element.parentNode.removeChild(element);
    },
}

var total_handlers = 0;
function FirebugConsoleHandler(context, win)
{
    this.window = win;

    this.attachTo = function(element)
    {
        this.element = element;
        // When raised on our injected element, callback to Firebug and append to console
        this.boundHandler = bind(this.handleEvent, this);
        this.element.addEventListener('firebugAppendConsole', this.boundHandler, true); // capturing
    };

    this.detach = function()
    {
        this.element.removeEventListener('firebugAppendConsole', this.boundHandler, true);
    };

    this.handler_name = ++total_handlers;
    this.handleEvent = function(event)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("FirebugConsoleHandler("+this.handler_name+") "+event.target.getAttribute("methodName")+", event", event);
        if (!Firebug.CommandLine.CommandHandler.handle(event, this, win))
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("FirebugConsoleHandler", this);

            var methodName = event.target.getAttribute("methodName");
            Firebug.Console.log($STRF("console.MethodNotSupported", [methodName]));
        }
    };

    this.firebug = Firebug.version;

    this.init = function()
    {
        var consoleElement = win.document.getElementById('_firebugConsole');
        consoleElement.setAttribute("FirebugVersion", Firebug.version);
    };

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
        logAssert("error", arguments);
    };

    this.assert = function(x)
    {
        if (!x)
        {
            var rest = [];
            for (var i = 1; i < arguments.length; i++)
                rest.push(arguments[i]);
            logAssert("assert", rest);
        }
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
        var trace = getJSDUserStack();
        Firebug.Console.log(trace, context, "stackTrace");
    };

    this.group = function()
    {
        var sourceLink = getStackLink();
        Firebug.Console.openGroup(arguments, null, "group", null, false, sourceLink);
    };

    this.groupEnd = function()
    {
        Firebug.Console.closeGroup(context);
    };

    this.groupCollapsed = function()
    {
        var sourceLink = getStackLink();
        // noThrottle true is probably ok, openGroups will likely be short strings.
        var row = Firebug.Console.openGroup(arguments, null, "group a11yCollapsed", null, true, sourceLink);
        removeClass(row, "opened");
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

    this.clear = function()
    {
        Firebug.Console.clear(context);
    };

    this.time = function(name, reset)
    {
        if (!name)
            return;

        var time = new Date().getTime();

        if (!this.timeCounters)
            this.timeCounters = {};

        var key = "KEY"+name.toString();

        if (!reset && this.timeCounters[key])
            return;

        this.timeCounters[key] = time;
    };

    this.timeEnd = function(name)
    {
        var time = new Date().getTime();

        if (!this.timeCounters)
            return;

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

    // These functions are over-ridden by commandLine
    this.evaluated = function(result, context)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.FirebugConsoleHandler evalutated default called", result);

        Firebug.Console.log(result, context);
    };
    this.evaluateError = function(result, context)
    {
        Firebug.Console.log(result, context, "errorMessage");
    };

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    function logFormatted(args, className, linkToSource, noThrottle)
    {
        var sourceLink = linkToSource ? getStackLink() : null;
        return Firebug.Console.logFormatted(args, context, className, noThrottle, sourceLink);
    }

    function logAssert(category, args)
    {
        Firebug.Errors.increaseCount(context);

        if (!args || !args.length || args.length == 0)
            var msg = [FBL.$STR("Assertion")];
        else
            var msg = args[0];

        var sourceName = win.location;
        var lineNumber = 0;
        if (msg.stack)
            var trace = parseToStackTrace(msg.stack);
        else
        {
            var trace = getJSDUserStack();
            if (trace && trace.frames && trace.frames[0])
            {
                var frame = trace.frames[0];
                sourceName = normalizeURL(frame.script.fileName);
                lineNumber = frame.line;
                if (lineNumber && sourceName)
                    var sourceLine = context.sourceCache.getLine(sourceName, lineNumber);
            }
        }
        if (msg.fileName)
            sourceName = msg.fileName;
        if (msg.lineNumber)
            lineNumber = msg.lineNumber;

        var errorObject = new FBL.ErrorMessage(msg, sourceName,
                        lineNumber, (sourceLine?sourceLine:""), category, context, trace);

        var row = Firebug.Console.log(errorObject, context, "errorMessage", null, true); // noThrottle
        row.scrollIntoView();
    }

    function getComponentsStackDump()
    {
        // Starting with our stack, walk back to the user-level code
        var frame = Components.stack;
        var userURL = win.location.href.toString();

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.getComponentsStackDump initial stack for userURL "+userURL, frame);

        // Drop frames until we get into user code.
        while (frame && FBL.isSystemURL(frame.filename) )
            frame = frame.caller;

        // Drop two more frames, the injected console function and firebugAppendConsole()
        if (frame)
            frame = frame.caller;
        if (frame)
            frame = frame.caller;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.getComponentsStackDump final stack for userURL "+userURL, frame);

        return frame;
    }

    function getStackLink()
    {
        return FBL.getFrameSourceLink(getComponentsStackDump());
    }

    function getJSDUserStack()
    {
        var trace = FBL.getCurrentStackTrace(context);

        var frames = trace ? trace.frames : null;
        if (frames && (frames.length > 0) )
        {
            var oldest = frames.length - 1;  // 6 - 1 = 5
            for (var i = 0; i < frames.length; i++)
            {
                if (frames[oldest - i].href.indexOf("chrome:") == 0) break;
                var fn = frames[oldest - i].fn + "";
                if (fn && (fn.indexOf("_firebugEvalEvent") != -1) ) break;  // command line
            }
            FBTrace.sysout("consoleInjector getJSDUserStack: "+frames.length+" oldest: "+oldest+" i: "+i+" i - oldest + 2: "+(i - oldest + 2), trace);
            trace.frames = trace.frames.slice(2 - i);  // take the oldest frames, leave 2 behind they are injection code

            return trace;
        }
        else
            return "Firebug failed to get stack trace with any frames";
    }
}

}});
