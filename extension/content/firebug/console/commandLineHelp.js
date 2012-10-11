/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/console/commandLineExposed",
    "firebug/chrome/window",
    "firebug/lib/xpcom",
    "firebug/lib/events",
],
function(Firebug, Domplate, Locale, Dom, CommandLineExposed, Win, Xpcom, Events) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var CMD_TYPE_COMMAND = 1;
var CMD_TYPE_SHORTCUT = 2;
var CMD_TYPE_PROPERTY = 3;

const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

// ********************************************************************************************* //
// Domplates

var HelpCaption = domplate(
{
    tag:
        SPAN({"class": "helpTitle"},
            SPAN({"class": "helpCaption"},
                Locale.$STR("console.cmd.help_title")
            ),
            SPAN({"class": "helpCaptionDesc"},
                Locale.$STR("console.cmd.help_title_desc")
            )
        )
});

// The table UI should be based on tableRep
var HelpTable = domplate(
{
    tag:
        TABLE({"class": "helpTable", cellspacing: 0, cellpadding: 0, width: "100%",
            "role": "grid"},
            THEAD({"class": "helpThead", "role": "presentation"},
                TR({"class": "headerRow focusRow helpRow subFocusRow", onclick: "$onClick",
                    "role": "row"},
                    TH({"class": "headerCell a11yFocus", "role": "columnheader", width: "10%"},
                        DIV({"class": "headerCellBox"},
                            Locale.$STR("Name")
                        )
                    ),
                    TH({"class": "headerCell a11yFocus", "role": "columnheader", width: "90%"},
                        DIV({"class": "headerCellBox"},
                            Locale.$STR("Description")
                        )
                    )
                )
            ),
            TBODY({"class": "helpTbody", "role": "presentation"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onClick: function(event)
    {
    }
});

var HelpEntry = domplate(
{
    tag:
        FOR("command", "$commands",
            TR({"class": "focusRow helpRow subFocusRow", "role": "row"},
                TD({"class": "a11yFocus helpCell commandName", "role": "presentation"},
                    A({"class": "objectLink", onclick: "$onClick", _repObject: "$command"},
                        "$command|getName"
                    )
                ),
                TD({"class": "a11yFocus helpCell commandDesc", "role": "gridcell"},
                    "$command|getDesc"
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onClick: function(event)
    {
        Events.cancelEvent(event);

        var object = Firebug.getRepObject(event.target);

        if (object.noUserHelpUrl)
        {
            prompts.alert(null, Locale.$STR("Firebug"),
                Locale.$STR("console.cmd.helpUrlNotAvailable"));
            return;
        }

        var helpUrl = "http://getfirebug.com/wiki/index.php/" + object.name;
        if (object.helpUrl)
            helpUrl = object.helpUrl;

        Win.openNewTab(helpUrl);
    },

    getName: function(object)
    {
        var name = object.name;
        if (object.type != CMD_TYPE_PROPERTY)
            name = name + "()";
        return name;
    },

    getDesc: function(object)
    {
        if (object.nol10n)
            return object.desc;

        return Locale.$STR(object.desc);
    }
});

// ********************************************************************************************* //
// Help Object

var CommandLineHelp = domplate(
{
    render: function(context)
    {
        var row = Firebug.Console.openGroup("help", context, "help",
            HelpCaption, true, null, true);
        Firebug.Console.closeGroup(context, true);

        var logGroupBody = row.lastChild;
        var table = HelpTable.tag.replace({}, logGroupBody);
        var tBody = table.lastChild;

        var commands = [];

        for (var i=0; i<CommandLineExposed.commands.length; i++)
        {
            commands.push({
                name: CommandLineExposed.commands[i],
                desc: "console.cmd.help." + CommandLineExposed.commands[i],
                type: CMD_TYPE_COMMAND,
            })
        }

        for (var i=0; i<CommandLineExposed.consoleShortcuts.length; i++)
        {
            commands.push({
                name: CommandLineExposed.consoleShortcuts[i],
                desc: "console.cmd.help." + CommandLineExposed.consoleShortcuts[i],
                type: CMD_TYPE_SHORTCUT,
            })
        }

        for (var i=0; i<CommandLineExposed.properties.length; i++)
        {
            commands.push({
                name: CommandLineExposed.properties[i],
                desc: "console.cmd.help." + CommandLineExposed.properties[i],
                type: CMD_TYPE_PROPERTY,
            })
        }

        for (var name in CommandLineExposed.userCommands)
        {
            var config = CommandLineExposed.userCommands[name];
            commands.push({
                name: name,
                desc: config.description,
                nol10n: true,
                noUserHelpUrl: !config.helpUrl,
                helpUrl: config.helpUrl ? config.helpUrl: null,
                type: config.getter ? CMD_TYPE_PROPERTY : CMD_TYPE_COMMAND,
            })
        }

        // Sort commands
        commands.sort(function sortName(a, b) { return a.name > b.name ? 1 : -1; });

        // Generate table
        HelpEntry.tag.insertRows({commands: commands}, tBody);

        return row;
    }
});

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context)
{
    CommandLineHelp.render(context);
    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("help", {
    getter: true,
    helpUrl: "http://getfirebug.com/wiki/index.php/help",
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.help")
});

return CommandLineHelp;

// ********************************************************************************************* //
}});
