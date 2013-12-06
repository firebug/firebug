/* See license.txt for terms of usage */
/*jshint unused:false*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/chrome/measureBox",
],
function(Firebug, Obj, MeasureBox) {

// ********************************************************************************************* //
// BaseEditor

var BaseEditor = Obj.extend(MeasureBox,
{
    getInitialValue: function(target, value)
    {
        return value;
    },

    isEmptyValid: function(target)
    {
        return false;
    },

    getValue: function()
    {
    },

    setValue: function(value)
    {
    },

    show: function(target, panel, value, selectionData)
    {
    },

    hide: function()
    {
    },

    layout: function(forceAll)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for context menus within inline editors.

    getContextMenuItems: function(target)
    {
        var items = [];
        items.push({label: "Cut", command: Obj.bind(this.onCommand, this, "cmd_cut")});
        items.push({label: "Copy", command: Obj.bind(this.onCommand, this, "cmd_copy")});
        items.push({label: "Paste", command: Obj.bind(this.onCommand, this, "cmd_paste")});
        return items;
    },

    onCommand: function(command, cmdId)
    {
        var browserWindow = Firebug.chrome.window;

        // Use the right browser window to get the current command controller (issue 4177).
        var controller = browserWindow.document.commandDispatcher.getControllerForCommand(cmdId);
        var enabled = controller.isCommandEnabled(cmdId);
        if (controller && enabled)
            controller.doCommand(cmdId);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editor Module listeners will get "onBeginEditing" just before this call

    beginEditing: function(target, value)
    {
    },

    // Editor Module listeners will get "onSaveEdit" just after this call
    saveEdit: function(target, value, previousValue)
    {
    },

    endEditing: function(target, value, cancel)
    {
        // Remove empty groups by default
        return true;
    },

    cancelEditing: function(target, value)
    {
    },

    insertNewRow: function(target, insertWhere)
    {
    },
});


Firebug.BaseEditor = BaseEditor;

return BaseEditor;

// ********************************************************************************************* //
});
