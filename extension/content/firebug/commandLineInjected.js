/* See license.txt for terms of usage */

var _FirebugCommandLine = 
{
    init: function()
    {
        var commands = ["$", "$$", "$x", "cd", "clear", "inspect", "keys", 
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
        
        var consoleShortcuts = ["dir", "dirxml"];
        for (var i=0; i<consoleShortcuts.length; i++)
        {
            var command = consoleShortcuts[i];
            this[command] = new Function("return window.console." + command + ".apply(window.console, arguments)");
        }
    }
};

_FirebugCommandLine.init();
