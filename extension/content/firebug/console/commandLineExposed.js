/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/wrapper",
    "firebug/lib/events",
],
function(Firebug, Wrapper, Events) {

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
    var contentView = Wrapper.getContentView(win);
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
        "copy", "memoryProfile", "memoryProfileEnd"];

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
        commandLine.__exposedProps__[command] = "rw";
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
        commandLine.__exposedProps__[command] = "rw";
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
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Exposed.attachCommandLine; "+window.location);

        if (!contentView.console)
        {
            var console = createFirebugConsole(context, win);
            contentView.console = console;
        }

        Events.addEventListener(contentView.document, "firebugCommandLine", firebugEvalEvent, true);
    }

    function detachCommandLine()
    {
        Events.removeEventListener(contentView.document, "firebugCommandLine", firebugEvalEvent, true);
        delete contentView._FirebugCommandLine; // suicide!

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Exposed.detachCommandLine; "+window.location);
    }

    function firebugEvalEvent(event)
    {
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Exposed.firebugEvalEvent "+window.location);

        var expr = contentView.document.getUserData("firebug-expr"); // see commandLine.js
        evaluate(expr);

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Exposed; did evaluate on "+expr);
    }

    function evaluate(expr)
    {
        try
        {
            var line = Components.stack.lineNumber;
            var result = contentView.eval(expr);
            notifyFirebug([result], "evaluated", "firebugAppendConsole");
        }
        catch(exc)
        {
            // change source and line number of exeptions from commandline code
            // create new error since properties of nsIXPCException are not modifiable
            var shouldModify, isXPCException;
            if (exc.filename == Components.stack.filename)
                shouldModify = isXPCException = true;
            else if(exc.fileName == Components.stack.filename)
                shouldModify = true;

            if (shouldModify)
            {
                var result = new Error;
                delete result.stack;
                result.source = expr;
                result.message = exc.message;
                result.lineNumber = exc.lineNumber - line;
                result.fileName = "data:," + encodeURIComponent(expr);
                if(!isXPCException)
                    result.name = exc.name;
            }
            else
            {
                result = exc;
            }
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

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Exposed; dispatched event "+methodName+" via "+
                eventID+" with "+objs.length+ " user objects, [0]:"+commandLine.userObjects[0]);

        var result;
        if (contentView.document.getUserData("firebug-retValueType") == "array")
            result = [];

        if (!result && commandLine.userObjects.length == length+1)
            return commandLine.userObjects[length];

        for (var i=length; i<commandLine.userObjects.length && result; i++)
            result.push(commandLine.userObjects[i]);

        return result;
    }

    return commandLine;
};

// ********************************************************************************************* //
// Registration

Firebug.CommandLineExposed =
{
    createFirebugCommandLine: createFirebugCommandLine
};

return Firebug.CommandLineExposed;

// ********************************************************************************************* //
});
