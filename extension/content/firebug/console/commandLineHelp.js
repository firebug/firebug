/* See license.txt for terms of usage */

define([
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/console/commandLineExposed",
],
function(Domplate, Locale, Dom, CommandLineExposed) { with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var CMD_TYPE_COMMAND = 1;
var CMD_TYPE_SHORTCUT = 2;
var CMD_TYPE_PROPERTY = 3;

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
                    "$command|getName"
                ),
                TD({"class": "a11yFocus helpCell commandDesc", "role": "gridcell"},
                    "$command|getDesc"
                )
            )
        ),

    getName: function(object)
    {
        var name = object.name;
        if (object.type != CMD_TYPE_PROPERTY)
            name = name + "()";
        return name;
    },

    getDesc: function(object)
    {
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

        HelpEntry.tag.insertRows({commands: commands}, tBody);

        return row;
    }
});

// ********************************************************************************************* //
// Registration

return CommandLineHelp;

// ********************************************************************************************* //
}});
