/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/trace",
    "firebug/console/commandLine",
    "firebug/lib/locale",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/string",
],
function(Firebug, Module, FBTrace, CommandLine, Locale, Obj, Menu, SourceLink, Str) {

"use strict";

// ********************************************************************************************* //
// UseInCommandLine Implementation

/**
 * @module Responsible for implementing 'Use in Command Line' feature.
 * See also: https://getfirebug.com/wiki/index.php/$p
 */
var UseInCommandLine = Obj.extend(Module,
/** @lends UseInCommandLine */
{
    dispatchName: "UseInCommandLine",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Extends Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (typeof object === "boolean" || object === undefined || object === null)
            return;

        var rep = Firebug.getRep(object, context);
        if (!rep || !rep.inspectable)
            return;

        // Get the object that should be associated with '$p' variable.
        // The same way is used by e.g. 'Inspect In DOM panel' command.
        object = rep.getRealObject(object, context);
        if (object instanceof SourceLink)
            return;

        var item = {
            label: "commandline.Use_in_Command_Line",
            tooltiptext: "commandline.tip.Use_in_Command_Line",
            id: "fbUseInCommandLine",
            command: this.useInCommandLine.bind(this, context, object)
        };

        // Add the item before the first "Inspect in * Panel" option (or at the bottom
        // together with a separator if there is none).
        var before = Array.prototype.filter.call(popup.childNodes, function(node)
        {
            return Str.hasPrefix(node.id, "InspectIn");
        })[0];

        if (!before)
            Menu.createMenuSeparator(popup);

        Menu.createMenuItem(popup, item, before);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu Actions

    useInCommandLine: function(context, object)
    {
        context.rememberedObject = object;

        var panel = Firebug.chrome.getSelectedPanel();

        var hasConsole = !!context.getPanel("console", true);
        if (!hasConsole)
            Firebug.chrome.selectPanel("console");
        else if (panel && panel.name != "console" && !CommandLine.Popup.isVisible())
            CommandLine.Popup.toggle(context);

        var commandLine = CommandLine.getCommandLine(context);
        var valueLength = commandLine.value.length;
        var ins = "$p";

        commandLine.value += ins;
        commandLine.focus();
        commandLine.setSelectionRange(valueLength, valueLength + ins.length);

        CommandLine.autoCompleter.hide();
        CommandLine.update(context);
    }
});

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context)
{
    return context.rememberedObject;
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(UseInCommandLine);

Firebug.registerCommand("$p", {
    variable: true,
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.$p")
});

return UseInCommandLine;

// ********************************************************************************************* //
});
