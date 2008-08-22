/* See license.txt for terms of usage */

var _FirebugCommandLine = 
{
    init: function()
    {
        // Define console functions.
        var commands = ["$", "$$", "$x", "$n", "cd", "clear", "inspect", "keys", 
            "values", "debug", "undebug", "monitor", "unmonitor", 
            "monitorEvents", "unmonitorEvents", "profile", "profileEnd", "copy"];
        for (var i=0; i<commands.length; i++)
        {
            var command = commands[i];

            // If the method is already defined, don't override it. 
            if (top[command])
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
            if (top[prop])
                continue;

            this.__defineGetter__(prop, new Function(
                "return window.console.notifyFirebug(arguments, '" + prop + "', 'firebugExecuteCommand');"));
        }
    }
};

_FirebugCommandLine.init();
