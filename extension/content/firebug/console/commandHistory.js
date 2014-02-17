/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/options",
    "firebug/console/autoCompleter"
],
function(Firebug, Events, Wrapper, Css, Dom, Str, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //

Firebug.CommandHistory = function()
{
    var commandsPopup = Firebug.chrome.$("fbCommandHistory");
    var commands = this.commands = [];
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
            var commandHistoryMax = Options.get("consoleCommandHistoryMax")

            if (commandHistoryMax > 0 && commandInsertPointer + 1 >= commandHistoryMax)
                commands.shift();
            else
                commandInsertPointer++;

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
        var command;
        var commandLine = Firebug.CommandLine.getCommandLine(context);

        commandPointer += dir;
        if (commandPointer < 0)
            commandPointer = 0;
        else if (commandPointer > commands.length)
            commandPointer = commands.length;

        if (commandPointer < commands.length)
        {
            command = commands[commandPointer];
            if (commandsPopup.state == "open")
            {
                var commandElement = commandsPopup.children[commandPointer];
                this.selectCommand(commandElement);

                Dom.scrollMenupopup(commandsPopup, commandElement);
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
            return this.hide();

        Dom.eraseNode(commandsPopup);

        if(commands.length == 0)
            return;

        var doc = commandsPopup.ownerDocument;

        for (var i = 0; i < commands.length; i++)
        {
            var hbox = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");

            hbox.classList.add("commandHistoryItem");
            var shortExpr = Str.cropString(Str.stripNewLines(commands[i]), 50);
            hbox.textContent = shortExpr;
            hbox.value = i;
            commandsPopup.appendChild(hbox);

            if (i === commandPointer)
                this.selectCommand(hbox);
        }

        commandsPopup.openPopup(element, "before_start", 0, 0, false, false);

        // make sure last element is visible
        setTimeout(Dom.scrollMenupopup, 10, commandsPopup, hbox);
        this.isOpen = true;

        return true;
    };

    this.hide = function()
    {
        commandsPopup.hidePopup();
        this.isOpen = false;
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
        var i = event.target.value;
        if (i == undefined)
            return;

        var commandLine = Firebug.CommandLine.getCommandLine(Firebug.currentContext);

        commandLine.value = commands[i];
        commandPointer = event.target.value;

        Firebug.CommandLine.commandHistory.hide();
    };

    this.onPopupHidden = function(event)
    {
        Firebug.chrome.setGlobalAttribute("fbCommandLineHistoryButton", "checked", "false");
        Firebug.chrome.setGlobalAttribute("fbCommandEditorHistoryButton", "checked", "false");
        this.isOpen = false;
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
