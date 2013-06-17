/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/locale",
],
function(Firebug, FBTrace, Domplate, Locale) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

// xxxHonza: what about displaying target-chain somewhere?

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //
// GetEventListeners Implementation

var GetEventListeners =
{
}

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context, args)
{
    var element = args[0];
    if (!element)
    {
        FBTrace.sysout("getEventListenersCmd.onExecuteCommand; ERROR missing argument!");
        return;
    }

    FBTrace.sysout("getEventListenersCmd.onExecuteCommand; element", element);

    return Firebug.Console.getDefaultReturnValue();
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("getEventListeners", {
    helpUrl: "http://getfirebug.com/wiki/index.php/getEventListeners",
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.getEventListeners")
});

return GetEventListeners;

// ********************************************************************************************* //
}});
