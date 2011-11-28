/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/console/autoCompleter"
],
function(Firebug, Events, Wrapper, Css, Dom, Str) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //

Firebug.CommandHistory = function()
{
    const commandHistoryMax = 1000;

    var commandsPopup = Firebug.chrome.$("fbCommandHistory");
    var commands = [];
    var commandPointer = 0;
    var commandInsertPointer = -1;

    this.getLastCommand = function()
    {
        var command = commands[commandInsertPointer];
        if (!command)
            return "";

        return command;
    };

    this.appendToHistory = function(command)
    {
        if (commands[commandInsertPointer] != command)
        {
            commandInsertPointer++;
            if (commandInsertPointer >= commandHistoryMax)
                commandInsertPointer = 0;

            commands[commandInsertPointer] = command;
        }

        commandPointer = commandInsertPointer + 1;

        if (Firebug.chrome.$("fbCommandLineHistoryButton").hasAttribute("disabled"))
        {
            Firebug.chrome.$("fbCommandLineHistoryButton").removeAttribute("disabled");
            Firebug.chrome.$("fbCommandEditorHistoryButton").removeAttribute("disabled");

            this.attachListeners();
        }
    };

    this.attachListeners = function()
    {
        Events.addEventListener(commandsPopup, "mouseover", this.onMouseOver, true);
        Events.addEventListener(commandsPopup, "mouseup", this.onMouseUp, true);
        Events.addEventListener(commandsPopup, "popuphidden", this.onPopupHidden, true);
    };

    this.detachListeners = function()
    {
        Events.removeEventListener(commandsPopup, "mouseover", this.onMouseOver, true);
        Events.removeEventListener(commandsPopup, "mouseup", this.onMouseUp, true);
        Events.removeEventListener(commandsPopup, "popuphidden", this.onPopupHidden, true);
    };

    this.cycleCommands = function(context, dir)
    {
        var command,
            commandLine = Firebug.CommandLine.getCommandLine(context);

        if (dir < 0)
        {
            if (commandPointer > 0)
                commandPointer--;
        }
        else
        {
            if (commandPointer < commands.length)
                commandPointer++;
        }

        if (commandPointer < commands.length)
        {
            command = commands[commandPointer];
            if (commandsPopup.state == "open")
            {
                var commandElements = commandsPopup.ownerDocument.getElementsByClassName(
                    "commandHistoryItem");
                this.selectCommand(commandElements[commandPointer]);
            }
        }
        else
        {
            command = "";
            this.removeCommandSelection();
        }

        commandLine.value = command;
        Firebug.CommandLine.autoCompleter.hide();
        Firebug.CommandLine.update(context);
        setCursorToEOL(commandLine);
    };

    this.isShown = function()
    {
        return commandsPopup.state == "open";
    };

    this.show = function(element)
    {
        if (this.isShown())
            return this.hide;

        Dom.eraseNode(commandsPopup);

        if(commands.length == 0)
            return;

        var vbox = commandsPopup.ownerDocument.createElement("vbox");

        for (var i = 0; i < commands.length; i++)
        {
            var hbox = commandsPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml", "div");

            hbox.classList.add("commandHistoryItem");
            var shortExpr = Str.cropString(Str.stripNewLines(commands[i]), 50);
            hbox.innerHTML = Str.escapeForTextNode(shortExpr);
            hbox.value = i;
            vbox.appendChild(hbox);

            if (i === commandPointer)
                this.selectCommand(hbox);
        }

        commandsPopup.appendChild(vbox);
        commandsPopup.openPopup(element, "before_start", 0, 0, false, false);

        return true;
    };

    this.hide = function()
    {
        commandsPopup.hidePopup();

        return true;
    };

    this.toggle = function(element)
    {
        this.isShown() ? this.hide() : this.show(element);
    };

    this.removeCommandSelection = function()
    {
        var selected = commandsPopup.ownerDocument.getElementsByClassName("selected")[0];
        Css.removeClass(selected, "selected");
    };

    this.selectCommand = function(element)
    {
        this.removeCommandSelection();

        Css.setClass(element, "selected");
    };

    this.onMouseOver = function(event)
    {
        var hovered = event.target;

        if (hovered.localName == "vbox")
            return;

        Firebug.CommandLine.commandHistory.selectCommand(hovered);
    };

    this.onMouseUp = function(event)
    {
        var commandLine = Firebug.CommandLine.getCommandLine(Firebug.currentContext);

        commandLine.value = commands[event.target.value];
        commandPointer = event.target.value;

        Firebug.CommandLine.commandHistory.hide();
    };

    this.onPopupHidden = function(event)
    {
        Firebug.chrome.setGlobalAttribute("fbCommandLineHistoryButton", "checked", "false");
        Firebug.chrome.setGlobalAttribute("fbCommandEditorHistoryButton", "checked", "false");
    };
};

// ********************************************************************************************* //
// Helpers

//xxxHonza: duplicated in console/autoCompleter.js
function setCursorToEOL(input)
{
    // textbox version, https://developer.mozilla.org/en/XUL/Property/inputField
    // input.inputField.setSelectionRange(len, len);
    input.setSelectionRange(input.value.length, input.value.length);
}

// ********************************************************************************************* //
// Registration

return Firebug.CommandHistory;

// ********************************************************************************************* //
});
