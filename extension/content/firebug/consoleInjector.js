/* See license.txt for terms of usage */

//
FBL.ns(function() { with (FBL) {
// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

top.Firebug.Console.injector = {

    attachConsole: function(context, win)
    {
        var src = this.getInjectedSource();
        var result = Firebug.CommandLine.evaluate(src, context, null, win);  // win maybe frame

        if (result instanceof FBL.ErrorMessage)
            Firebug.Console.log(result, context, "assert");

        var handler = new FirebugConsoleHandler(context, win);
        win.addEventListener('firebugAppendConsole', bind(handler.handleEvent, handler) , true); // capturing
    },

    getInjectedSource: function()
    {
        if (!this.injectedSource)
            this.injectedSource = this.getResource("chrome://firebug/content/consoleInjected.js");
        return this.injectedSource;
    },

    getResource: function(aURL)
    {
        var ioService=Components.classes["@mozilla.org/network/io-service;1"]
            .getService(Components.interfaces.nsIIOService);
        var scriptableStream=Components
            .classes["@mozilla.org/scriptableinputstream;1"]
            .getService(Components.interfaces.nsIScriptableInputStream);

        var channel=ioService.newChannel(aURL,null,null);
        var input=channel.open();
        scriptableStream.init(input);
        var str=scriptableStream.read(input.available());
        scriptableStream.close();
        input.close();
        return str;
    }
}

function FirebugConsoleHandler(context, win)
{
    this.handleEvent = function(event)
    {

        var element = event.target;
        var firstAddition = element.getAttribute("firstAddition");
        var lastAddition = element.getAttribute("lastAddition");
        var methodName = element.getAttribute("methodName");
        var hosed_userObjects = win.wrappedJSObject.console.userObjects;

        //FBTrace.sysout("typeof(hosed_userObjects) "+ (typeof(hosed_userObjects))+"\n");
        //FBTrace.sysout("hosed_userObjects instanceof win.Array "+ (hosed_userObjects instanceof win.Array)+"\n");
        //FBTrace.sysout("hosed_userObjects instanceof win.wrappedJSObject.Array "+(hosed_userObjects instanceof win.wrappedJSObject.Array)+"\n");
        //FBTrace.dumpProperties("hosed_userObjects", hosed_userObjects);

        var userObjects = [];

        var j = 0;
        for (var i = firstAddition; i <= lastAddition; i++)
        {
            if (hosed_userObjects[i])
                userObjects[j++] = hosed_userObjects[i];
            else
                break;
        }

        if (FBTrace.DBG_CONSOLE || true)
        {
            //FBTrace.dumpProperties("FirebugConsoleHandler: element",  element);
            //FBTrace.dumpProperties("FirebugConsoleHandler event:", event);
            FBTrace.sysout("FirebugConsoleHandler: method(first, last): "+methodName+"("+firstAddition+","+lastAddition+")\n");
            FBTrace.dumpProperties("FirebugConsoleHandler: userObjects",  userObjects);
            //FBTrace.sysout("typeof(userObjects) "+ (typeof(userObjects))+"\n");
        }

        var subHandler = this[methodName];
        if (subHandler)
        {
            subHandler.apply(this, userObjects);
        }
        else
        {
            this.log("FirebugConsoleHandler does not support "+methodName);
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
        logFormatted(arguments, "error", true);
    };

    this.assert = function(x)
    {
        logAssert(arguments);
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
        var trace = getAccurateUserStackTrace();
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
        var sourceLink = linkToSource ? getStackLink() : null;
        return Firebug.Console.logFormatted(args, context, className, noThrottle, sourceLink);
    }

    function logAssert(args)
    {
        Firebug.Errors.increaseCount(context);

        if (!args || !args.length || args.length == 0)
            var msg = [FBL.$STR("Assertion")];
        else 
            var msg = args[0];

        var sourceName = win.location;
        var lineNumber = 0;
        var trace = getAccurateUserStackTrace();
        if (trace && trace.frames[0])
        {
            var frame = trace.frames[0];
            sourceName = frame.script.fileName;
            lineNumber = frame.line;
        }
        
        var errorObject = new FBL.ErrorMessage(msg, sourceName,
                        lineNumber, "", "assert", context, trace);
                        
        var row = Firebug.Console.log(errorObject, context, "errorMessage", null, true); // noThrottle
        row.scrollIntoView();
    }

    function getUserStack()
    {
        // Starting with our stack, walk back to the user-level code
        var frame = Components.stack;
        var userURL = win.location.href.toString();
        
        if (FBTrace.DBG_CONSOLE || true) 
            FBTrace.sysout("consoleInjector.getUserStack for userURL "+userURL, FBL.getStackDump());
            
        while (frame && (frame.filename != userURL) )
            frame = frame.caller;

        return frame;
    }

    function getStackLink()
    {
        return FBL.getFrameSourceLink(getUserStack());
    }
    
    function getAccurateUserStackTrace()
    {
        var trace = FBL.getCurrentStackTrace(context);

        var frames = trace.frames;
        if (frames && (frames.length > 0) )
        {
            var bottom = frames.length - 1;
            for (var i = 0; i < frames.length; i++)
                if (frames[bottom - i].href.indexOf("chrome:") == 0) break;

            trace.frames = trace.frames.slice(bottom - i + 1);
            return trace;
        }
        else
            return "Firebug failed to get stack trace with any frames";
    }
}

}});