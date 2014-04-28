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
    "firebug/lib/object",
],
function(Firebug, Domplate, Locale, Dom, CommandLineExposed, Win, Xpcom, Events, Obj) {

"use strict";

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var CMD_TYPE_COMMAND = 1;
var CMD_TYPE_SHORTCUT = 2;
var CMD_TYPE_PROPERTY = 3;

const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

var CLOSURE_INSPECTOR_HELP_URL = "https://getfirebug.com/wiki/index.php/Closure_Inspector";

// ********************************************************************************************* //
// Command Line Help

var {domplate, SPAN, TABLE, THEAD, TR, TH, DIV, TBODY, TD, A, UL, LI, FOR, TAG} = Domplate;

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
        ),

    groupable: false
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

        var helpUrl = "https://getfirebug.com/wiki/index.php/" + object.name;
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
// Command Line Tips

var TipsCaption = domplate(
{
    tag:
        SPAN({"class": "helpTitle"},
            SPAN({"class": "helpCaption"},
                Locale.$STR("console.cmd.tip_title")
            ),
            SPAN({"class": "helpCaptionDesc"},
                Locale.$STR("console.cmd.tip_title_desc")
            )
        ),

    groupable: false
});

var TipsList = domplate(
{
    tag:
        UL({"class": "tipsList"})
});

var Tip = domplate(
{
    loop:
        FOR("tip", "$tips",
            TAG("$tag", "$tip")
        ),

    tag:
        LI({"class": "tip"},
            SPAN({"class": "text"}, "$tip|getText"),
            SPAN("&nbsp;"),
            SPAN({"class": "example"},"$tip|getExample")
        ),

    getText: function(object)
    {
        return object.nol10n ? object.text : Locale.$STR(object.text);
    },

    getExample: function(object)
    {
        return object.example;
    }
});

// ********************************************************************************************* //
// Help Object

var CommandLineHelp = domplate(
{
    render: function(context)
    {
        this.renderHelp(context);
        this.renderTips(context);
    },

    renderHelp: function(context)
    {
        var row = Firebug.Console.openGroup("help", context, "help",
            HelpCaption, true, null, true);
        Firebug.Console.closeGroup(context, true);

        var logGroupBody = row.getElementsByClassName("logGroupBody")[0];
        var logContent = logGroupBody.getElementsByClassName("logContent")[0];
        var table = HelpTable.tag.append({}, logContent);
        var tBody = table.getElementsByClassName("helpTbody")[0];

        var commands = [];

        var ignore = ["traceCalls", "untraceCalls", "traceAll", "untraceAll"];
        for (var i=0; i<CommandLineExposed.commands.length; i++)
        {
            var cmd = CommandLineExposed.commands[i];

            // See Issue 5221
            if (ignore.indexOf(cmd) >= 0)
                continue;

            commands.push({
                name: cmd,
                desc: "console.cmd.help." + cmd,
                type: CMD_TYPE_COMMAND,
            });
        }

        for (var i=0; i<CommandLineExposed.consoleShortcuts.length; i++)
        {
            commands.push({
                name: CommandLineExposed.consoleShortcuts[i],
                desc: "console.cmd.help." + CommandLineExposed.consoleShortcuts[i],
                type: CMD_TYPE_SHORTCUT,
            });
        }

        for (var i=0; i<CommandLineExposed.properties.length; i++)
        {
            commands.push({
                name: CommandLineExposed.properties[i],
                desc: "console.cmd.help." + CommandLineExposed.properties[i],
                type: CMD_TYPE_PROPERTY,
            });
        }

        for (var name in CommandLineExposed.userCommands)
        {
            var config = CommandLineExposed.userCommands[name];
            var prop = config.getter || config.variable;

            if (config.hidden)
                continue;

            commands.push({
                name: name,
                desc: config.description,
                nol10n: true,
                noUserHelpUrl: !config.helpUrl,
                helpUrl: config.helpUrl ? config.helpUrl: null,
                type: prop ? CMD_TYPE_PROPERTY : CMD_TYPE_COMMAND,
            });
        }

        // Sort commands
        commands.sort(function sortName(a, b) { return a.name > b.name ? 1 : -1; });

        // Generate table
        HelpEntry.tag.insertRows({commands: commands}, tBody);
    },

    renderTips: function(context)
    {
        var row = Firebug.Console.openGroup("help", context, "help",
            TipsCaption, true, null, true);
        Firebug.Console.closeGroup(context, true);

        var logGroupBody = row.getElementsByClassName("logGroupBody")[0];
        var logContent = logGroupBody.getElementsByClassName("logContent")[0];
        var list = TipsList.tag.append({}, logContent);

        // #1) Render basic command line syntax tip
        var tip = {
            example: "1 + 1",
            text: "console.cmd.tip.javascript"
        };
        Tip.tag.append({tip: tip}, list);

        // #2) Render closure syntax tip
        tip = {
            example: "myObject.%closureVarName",
            text: "console.cmd.tip.closures"
        };

        function onClickLink()
        {
            Win.openNewTab(CLOSURE_INSPECTOR_HELP_URL);
        }

        var node = Tip.tag.append({tip: tip}, list);
        var textNode = node.getElementsByClassName("text").item(0);
        FirebugReps.Description.render(Locale.$STR(tip.text), textNode, onClickLink);
    }
});

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context)
{
    CommandLineHelp.render(context);
    return Firebug.Console.getDefaultReturnValue();
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("help", {
    helpUrl: "https://getfirebug.com/wiki/index.php/help",
    handler: onExecuteCommand,
    description: Locale.$STR("console.cmd.help.help"),
    getter: true,
    isCallableGetter: true,
});

return CommandLineHelp;

// ********************************************************************************************* //
});
