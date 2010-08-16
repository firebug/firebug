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
        var attachedToken = win.document.getUserData("firebug-Token");

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.isAttached document token:"+attachedToken+ " in "+safeGetWindowLocation(win));

        if (!attachedToken)
            return false;

        var handler = this.getConsoleHandler(context, win);

        if( !handler )
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("Console.isAttached no handler where we have a token!", context.activeConsoleHandlers);
            return false;
        }

        if (handler.token !== attachedToken)
        {
            var msg = "Firebug Console token changed! "+handler.token+" !== "+attachedToken;
            Firebug.Console.logFormatted([msg], context, "info");  // XXXTODO NLS
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout(msg +" context: "+context.getName());
        }
        return true;
    },

    attachIfNeeded: function(context, win)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.attachIfNeeded has win "+(win? ((win.wrappedJSObject?"YES":"NO")+" wrappedJSObject"):"null") );

        if (this.isAttached(context, win))
            return true;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("Console.attachIfNeeded found isAttached false " +
                safeGetWindowLocation(win));

        this.attachConsoleInjector(context, win);
        this.addConsoleListener(context, win);

        Firebug.Console.clearReloadWarning(context);

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
            script += "window.__defineGetter__('console', function console() {\n";
            script += " return (window._firebug ? window._firebug : window.loadFirebugConsole()); })\n\n";

            script += "window.loadFirebugConsole = function loadFirebugConsole() {\n";
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
        if (!win)
            win = context.window;

        if (win.wrappedJSObject)
            win = win.wrappedJSObject;

        win.document.setUserData("firebug-Version", Firebug.version, null); // Initialize Firebug version.

        var handler = createConsoleHandler(context, win);
        win.document.setUserData("firebug-Token", handler.token, null); // Initialize Firebug token

        this.setConsoleHandler(context, win, handler);

        return true;
    },

    getConsoleHandlerEntry: function(context, win)
    {
        var wrapperNonsense = (win.wrappedJSObject ? win.wrappedJSObject : win);
        if (context.activeConsoleHandlers)
        {
            for(var i = 0; i < context.activeConsoleHandlers.length; i++)
            {
                if (context.activeConsoleHandlers[i].win === wrapperNonsense)
                    return context.activeConsoleHandlers[i];
            }
        }
    },

    getConsoleHandler: function(context, win)
    {
        var entry = this.getConsoleHandlerEntry(context, win);
        if (entry)
            return entry.handler;
    },

    removeConsoleHandler: function(context, win)
    {
        var entry = this.getConsoleHandlerEntry(context, win);
        if (entry)
        {
            entry.handler.detach();
            remove(context.activeConsoleHandlers, entry);
        }
    },

    setConsoleHandler: function(context, win, handler)
    {
        if (!context.activeConsoleHandlers)
            context.activeConsoleHandlers = [];

        var wrapperNonsense = (win.wrappedJSObject ? win.wrappedJSObject : win);

        context.activeConsoleHandlers.push({win: wrapperNonsense, handler: handler });

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector addConsoleListener set token "+handler.token+" and  attached handler("+handler.handler_name+") to _firebugConsole in : "+safeGetWindowLocation(wrapperNonsense));

    },

    detachConsole: function(context, win)
    {
        if (!win)
            win = context.window;

        if (win.wrappedJSObject)
            win = win.wrappedJSObject;

        this.removeConsoleHandler(context, win);
    },
}

var total_handlers = 0;
function createConsoleHandler(context, win)
{
    var handler = {};
    handler.console = Firebug.Console.createConsole(context, win),

    handler.detach = function()
    {
        win.document.removeEventListener('firebugAppendConsole', this.boundHandler, true);

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector FirebugConsoleHandler removeEventListener "+this.handler_name);
    };

    handler.handler_name = ++total_handlers;
    handler.token = Math.random();

    handler.handleEvent = function(event)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("FirebugConsoleHandler("+this.handler_name+") "+win.document.getUserData("firebug-methodName")+", event", event);
        if (!Firebug.CommandLine.CommandHandler.handle(event, this.console, win))
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("FirebugConsoleHandler", this);

            var methodName = win.document.getUserData("firebug-methodName");
            Firebug.Console.log($STRF("console.MethodNotSupported", [methodName]));
        }
    };

    handler.setEvaluatedCallback = function( fnOfResult )
    {
        this.console.evaluated = fnOfResult;
    };

    handler.setEvaluateErrorCallback = function( fnOfResultAndContext )
    {
        this.console.evaluateError = fnOfResultAndContext;
    };

    // When raised on our injected element, callback to Firebug and append to console

    win.document.addEventListener('firebugAppendConsole', bind(handler.handleEvent, handler), true); // capturing

    if (FBTrace.DBG_CONSOLE)
        FBTrace.sysout("consoleInjector FirebugConsoleHandler addEventListener "+handler.handler_name);

    return handler;
}

Firebug.Console.createConsole = function createConsole(context, win)
{
    var console = {};
    console.log = function()
    {
        logFormatted(arguments, "log");
    };

    console.debug = function()
    {
        logFormatted(arguments, "debug", true);
    };

    console.info = function()
    {
        logFormatted(arguments, "info", true);
    };

    console.warn = function()
    {
        logFormatted(arguments, "warn", true);
    };

    console.error = function()
    {
        if (arguments.length == 1)
        {
            logAssert("error", arguments);  // add more info based on stack trace
        }
        else
        {
            Firebug.Errors.increaseCount(context);
            logFormatted(arguments, "error", true);  // user already added info
        }
    };

    console.exception = function()
    {
        logAssert("error", arguments);
    };

    console.assert = function(x)
    {
        if (!x)
        {
            var rest = [];
            for (var i = 1; i < arguments.length; i++)
                rest.push(arguments[i]);
            logAssert("assert", rest);
        }
    };

    console.dir = function(o)
    {
        Firebug.Console.log(o, context, "dir", Firebug.DOMPanel.DirTable);
    };

    console.dirxml = function(o)
    {
        if (o instanceof Window)
            o = o.document.documentElement;
        else if (o instanceof Document)
            o = o.documentElement;

        Firebug.Console.log(o, context, "dirxml", Firebug.HTMLPanel.SoloElement);
    };

    console.group = function()
    {
        var sourceLink = getStackLink();
        Firebug.Console.openGroup(arguments, null, "group", null, false, sourceLink);
    };

    console.groupEnd = function()
    {
        Firebug.Console.closeGroup(context);
    };

    console.groupCollapsed = function()
    {
        var sourceLink = getStackLink();
        // noThrottle true is probably ok, openGroups will likely be short strings.
        var row = Firebug.Console.openGroup(arguments, null, "group", null, true, sourceLink);
        removeClass(row, "opened");
    };

    console.profile = function(title)
    {
        Firebug.Profiler.startProfiling(context, title);
    };

    console.profileEnd = function()
    {
        Firebug.Profiler.stopProfiling(context);
    };

    console.count = function(key)
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

    console.clear = function()
    {
        Firebug.Console.clear(context);
    };

    console.time = function(name, reset)
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

    console.timeEnd = function(name)
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

    console.table = function(data, columns)
    {
        FirebugReps.Table.log(data, columns, context);
    };

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    // These functions are over-ridden by commandLine
    console.evaluated = function(result, context)
    {
        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("consoleInjector.FirebugConsoleHandler evalutated default called", result);

        Firebug.Console.log(result, context);
    };

    console.evaluateError = function(result, context)
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

        if (msg.stack)
        {
            var trace = parseToStackTrace(msg.stack);
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

        var url = msg.fileName ? msg.fileName : win.location.href;
        var lineNo = msg.lineNumber ? msg.lineNumber : 0;
        var errorObject = new FBL.ErrorMessage(msg, url, lineNo, "", category, context, trace);

        if (trace && trace.frames && trace.frames[0])
           errorObject.correctWithStackTrace(trace);

        errorObject.resetSource();

        if (args.length > 1)
        {
            errorObject.objects = []
            for (var i = 1; i < args.length; i++)
                errorObject.objects.push(args[i]);
        }

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
    }

    return console;
}

}});
