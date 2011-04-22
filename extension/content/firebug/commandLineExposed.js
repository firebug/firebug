/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Command Line APIs

/**
 * Returns a command line object (bundled with passed window through closure). The object
 * provides all necessary APIs as described here:
 * http://getfirebug.com/wiki/index.php/Command_Line_API
 * 
 * @param {Object} context
 * @param {Object} win
 */
function createFirebugCommandLine(context, win)
{
    var contentView = FBL.getContentView(win);
    if (!contentView)
    {
        if (FBTrace.DBG_COMMANDLINE || FBTrace.DBG_ERRORS)
            FBTrace.sysout("createFirebugCommandLine ERROR no contentView "+context.getName())
            return null;
    }

    // The commandLine object
    var commandLine = {
        __exposedProps__: {}
    };

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Exposed Properties

    // List of command line APIs
    var commands = ["$", "$$", "$x", "$n", "cd", "clear", "inspect", "keys",
        "values", "debug", "undebug", "monitor", "unmonitor", "traceCalls", "untraceCalls",
        "traceAll", "untraceAll", "monitorEvents", "unmonitorEvents", "profile", "profileEnd",
        "copy"];

    // Define command line methods
    for (var i=0; i<commands.length; i++)
    {
        var command = commands[i];

        // If the method is already defined, don't override it.
        if (contentView[command])
            continue;

        function createCommandHandler(cmd) {
            return function() {
                return notifyFirebug(arguments, cmd, 'firebugExecuteCommand');
            }
        }

        commandLine[command] = createCommandHandler(command);
        commandLine.__exposedProps__[command] = "r";
    }

    // Define shortcuts for some console methods
    var consoleShortcuts = ["dir", "dirxml", "table"];
    for (var i=0; i<consoleShortcuts.length; i++)
    {
        var command = consoleShortcuts[i];

        // If the method is already defined, don't override it.
        if (contentView[command])
            continue;

        function createShortcutHandler(cmd) {
            return function() {
                return contentView.console[cmd].apply(contentView.console, arguments);
            }
        }

        commandLine[command] = createShortcutHandler(command);
        commandLine.__exposedProps__[command] = "r";
    }

    // Define console variables (inspector history).
    var props = ["$0", "$1"];
    for (var i=0; i<props.length; i++)
    {
        var prop = props[i];
        if (contentView[prop])
            continue;

        function createVariableHandler(prop) {
            return function() {
                return notifyFirebug(arguments, prop, 'firebugExecuteCommand');
            }
        }

        commandLine.__defineGetter__(prop, createVariableHandler(prop));
        commandLine.__exposedProps__[prop] = "r";
    }

    attachCommandLine();

    // xxxHonza: TODO make this private.
    commandLine["detachCommandLine"] = detachCommandLine;
    commandLine.__exposedProps__["detachCommandLine"] = "r";

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers (not accessible from web content)

    function attachCommandLine()
    {
        // DBG window.dump("attachCommandLine "+window.location+"\n");
        if (!contentView.console)
        {
            var console = createFirebugConsole(context, win);
            contentView.console = console;
        }

        this._firebugEvalEvent = function _firebugEvalEvent(event)
        {
            // DBG window.dump("attachCommandLine firebugCommandLine "+window.location+"\n");
            var expr = contentView.document.getUserData("firebug-expr"); // see commandLine.js
            evaluate(expr);
            // DBG window.dump("attachCommandLine did evaluate on "+expr+"\n");
        }

        contentView.document.addEventListener("firebugCommandLine",this._firebugEvalEvent, true);
        contentView.document.setUserData("firebug-CommandLineAttached", "true", null);
        // DBG window.dump("Added listener for firebugCommandLine event "+window.location+"\n");
    }

    function detachCommandLine()
    {
         contentView.document.removeEventListener("firebugCommandLine", this._firebugEvalEvent, true);
         delete contentView._FirebugCommandLine; // suicide!
         // DBG window.dump("detachCommmandLine<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n")
    }

    function evaluate(expr)
    {
        try
        {
            var result = contentView.eval(expr);
            notifyFirebug([result], "evaluated", "firebugAppendConsole");
        }
        catch(exc)
        {
            var result = exc;
            result.source = expr;
            notifyFirebug([result], "evaluateError", "firebugAppendConsole");
        }
    }

    function notifyFirebug(objs, methodName, eventID)
    {
        var event = contentView.document.createEvent("Events");
        event.initEvent(eventID, true, false);

        commandLine.userObjects = [];
        for (var i=0; i<objs.length; i++)
            commandLine.userObjects.push(objs[i]);

        var length = commandLine.userObjects.length;
        contentView.document.setUserData("firebug-methodName", methodName, null);

        contentView.document.dispatchEvent(event);

        // DBG dump("FirebugConsole dispatched event "+methodName+" via "+eventID+" with "+length+ " user objects, [0]:"+console.userObjects[0]+"\n");

        var result;
        if (contentView.document.getUserData("firebug-retValueType") == "array")
            result = [];

        if (!result && commandLine.userObjects.length == length+1)
            return commandLine.userObjects[length];

        for (var i=length; i<commandLine.userObjects.length && result; i++)
            result.push(commandLine.userObjects[i]);

        return result;
    }

    function sysout(message)
    {
        
    }

    // DBG window.dump("_FirebugCommandLine init console is "+window.console+
    // " in "+window.location+"\n");

    return commandLine;
};

// ********************************************************************************************* //
