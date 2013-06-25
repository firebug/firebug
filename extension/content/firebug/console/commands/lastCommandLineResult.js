/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/console/console",
    "firebug/console/commandLine",
    "firebug/lib/locale",
    "firebug/lib/object",
],
function(Firebug, FBTrace, Console, CommandLine, Locale, Obj) {

// ********************************************************************************************* //
// CommandLine Listener

var LastCommandLineResult = Obj.extend(Firebug.Module,
{
    dispatchName: "LastCommandLineResult",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Extends Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        CommandLine.addListener(this);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        CommandLine.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // CommandLine Listener

    expressionEvaluated: function(context, expr, result, success)
    {
        // Remember the last evaluated result (only in case of success).
        if (success)
            context.lastCommandLineResult = result;
    }
});

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context)
{
    return context.lastCommandLineResult;
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(LastCommandLineResult);

Firebug.registerCommand("$_", {
    variable: true,
    helpUrl: "https://getfirebug.com/wiki/index.php/Dollar-underscore",
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.$_")
});

return LastCommandLineResult;

// ********************************************************************************************* //
});
