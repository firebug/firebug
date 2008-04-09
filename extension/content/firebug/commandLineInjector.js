/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ************************************************************************************************
// Implementation

top.Firebug.CommandLine.injector = {

    attachCommandLine: function(context, win)
    {
        if (!win)
            return;

        // If the command line is already attached then end.
        var doc = win.document;
        if ($("_firebugCommandLineInjector", doc))
            return;

        // Inject command line script into the page.
        var scriptSource = getResource("chrome://firebug/content/commandLineInjected.js");
        addScript(doc, "_firebugCommandLineInjector", scriptSource);

        // Register listener for command-line execution events.
        var handler = new CommandLineHandler(context, win);
        var element = $("_firebugConsole", doc);
        element.addEventListener("firebugExecuteCommand", bind(handler.handleEvent, handler) , true);
        
        if (FBTrace.DBG_CONSOLE)                                                                                       /*@explore*/
            FBTrace.sysout("Command line is successfully attached to: " + win.location + "\n");                        /*@explore*/
    }
};

// ************************************************************************************************

function CommandLineHandler(context, win) 
{
    this.handleEvent = function(event)
    {
        if (!Firebug.CommandLine.CommandHandler.handle(event, this, win))
        {
            FBTrace.dumpProperties("CommandLineHandler", this);
            // xxxHonza localization.
            this.log("Firebug command line does not support \'" + methodName + "\'");
        }
    };

    this.log = function(args)
    {
        return Firebug.Console.logFormatted(args, context);
    };

    var baseWindow = context.window;

    this.$ = function(id)
    {
        var doc = baseWindow.document;
        return baseWindow.document.getElementById(id);
    };

    this.$$ = function(selector)
    {
        return FBL.getElementsBySelector(baseWindow.document, selector);
    };

    this.$x = function(xpath)
    {
        return FBL.getElementsByXPath(baseWindow.document, xpath);
    };

    this.cd = function(object)
    {
        if (object instanceof Window)
            baseWindow = context.baseWindow = object;
        else
            throw "Object must be a window.";
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

    this.clear = function()
    {
        Firebug.Console.clear(context);
    };

    this.inspect = function(obj, panelName)
    {
        context.chrome.select(obj, panelName);
    };

    this.keys = function(o)
    {
        return FBL.keys(o);
    };

    this.values = function(o)
    {
        return FBL.values(o);
    };

    this.debug = function(fn)
    {
        Firebug.Debugger.trace(fn, null, "debug");
    };

    this.undebug = function(fn)
    {
        Firebug.Debugger.untrace(fn, null, "debug");
    };

    this.monitor = function(fn)
    {
        Firebug.Debugger.trace(fn, null, "monitor");
    };

    this.unmonitor = function(fn)
    {
        Firebug.Debugger.untrace(fn, null, "monitor");
    };

    this.monitorEvents = function(object, types)
    {
        monitorEvents(object, types, context);
    };

    this.unmonitorEvents = function(object, types)
    {
        unmonitorEvents(object, types, context);
    };

    this.profile = function(title)
    {
        Firebug.Profiler.startProfiling(context, title);
    };

    this.profileEnd = function()
    {
        Firebug.Profiler.stopProfiling(context);
    };

    this.copy = function(x)
    {
        FBL.copyToClipboard(x);
    };    
}

}});
