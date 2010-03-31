/* See license.txt for terms of usage */

var _FirebugCommandLine =
{
    initFirebugCommandLine: function()
    {
        // Define console functions.
        var commands = ["$", "$$", "$x", "$n", "cd", "clear", "inspect", "keys",
            "values", "debug", "undebug", "monitor", "unmonitor", "traceCalls", "untraceCalls",
            "traceAll", "untraceAll", "monitorEvents", "unmonitorEvents", "profile", "profileEnd", "copy"];
        for (var i=0; i<commands.length; i++)
        {
            var command = commands[i];

            // If the method is already defined, don't override it.
            if (window[command])
                continue;

            this[command] = new Function(
                "return window.console.notifyFirebug(arguments, '" + command + "', 'firebugExecuteCommand');");
        }

        // Define console shortcuts
        var consoleShortcuts = ["dir", "dirxml"];
        for (var i=0; i<consoleShortcuts.length; i++)
        {
            var command = consoleShortcuts[i];
            this[command] = new Function("return window.console." + command + ".apply(window.console, arguments)");
        }

        // Define console variables.
        var props = ["$0", "$1"];
        for (var j=0; j<props.length; j++)
        {
            var prop = props[j];
            if (window[prop])
                continue;

            this.__defineGetter__(prop, new Function(
                "return window.console.notifyFirebug(arguments, '" + prop + "', 'firebugExecuteCommand');"));
        }

        this.attachCommandLine();
    },

    attachCommandLine: function()
    {
        // DBG window.dump("attachCommandLine "+window.location+"\n");
        if (!window.console)
        {
            // DBG 	debugger;
            window.loadFirebugConsole();
        }
        var element = window.console.getFirebugElement();
        var self = this;
        element.addEventListener("firebugCommandLine", function _firebugEvalEvent(event)
        {
            // DBG window.dump("attachCommandLine firebugCommandLine "+window.location+"\n");
            var element = event.target;
            var expr = element.getAttribute("expr"); // see commandLine.js
            self.evaluate(expr);
            // DBG window.dump("attachCommandLine did evaluate on "+expr+"\n");
        }, true);
        element.setAttribute("firebugCommandLineAttached", "true")
        // DBG window.dump("Added listener for firebugCommandLine event "+window.location+"\n");
    },

    evaluate: function(expr)
    {
        try
        {
            var result = window.eval(expr);
            if (typeof result != "undefined")
                window.console.notifyFirebug([result], "evaluated", "firebugAppendConsole");
        }
        catch(exc)
        {
            var result = exc;
            result.source = expr;
            window.console.notifyFirebug([result], "evaluateError", "firebugAppendConsole");
        }
    },
};

(function()
{
    try
    {
        // DBG window.dump("_FirebugCommandLine init console is "+window.console+" in "+window.location+"\n");
        _FirebugCommandLine.initFirebugCommandLine();
    }
    catch(exc)
    {
        var wrappedException = {
            cause: exc,
            message: "_FirebugCommandLine init failed in "+window.location+" because "+exc,
            toString: function() { return this.message; }
        };
        throw wrappedException;
    }
})();
