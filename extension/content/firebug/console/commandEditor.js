/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/events",
    "firebug/chrome/menu",
    "firebug/lib/dom",
    "firebug/lib/locale",
],
function(Obj, Firebug, Events, Menu, Dom, Locale) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// Introduced in Firefox 8
Cu["import"]("resource:///modules/source-editor.jsm");

// ********************************************************************************************* //
// Command Editor

Firebug.CommandEditor = Obj.extend(Firebug.Module,
{
    dispatchName: "commandEditor",

    editor: null,

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (this.editor)
            return;

        this.editor = new SourceEditor();

        var config =
        {
            mode: SourceEditor.MODES.JAVASCRIPT,
            showLineNumbers: false,
            theme: "chrome://firebug/skin/orion-firebug.css"
        };

        // Initialize Orion editor.
        this.parent = document.getElementById("fbCommandEditor");
        this.editor.init(this.parent, config, this.onEditorLoad.bind(this));

        if (FBTrace.DBG_COMMANDEDITOR)
            FBTrace.sysout("commandEditor: SourceEditor initialized");
    },

    shutdown: function()
    {
        if (!this.editor)
            return;

        this.parent.removeEventListener("keypress", this.onKeyPress);
        this.editor.removeEventListener(SourceEditor.EVENTS.CONTEXT_MENU, this.onContextMenu);

        this.editor.destroy();
        this.editor = null;
    },

    /**
     * The load event handler for the source editor. This method does post-load
     * editor initialization.
     */
    onEditorLoad: function()
    {
        this.parent.addEventListener("keypress", this.onKeyPress);

        // xxxHonza: Context menu support is going to change in SourceEditor
        this.editor.addEventListener(SourceEditor.EVENTS.CONTEXT_MENU, this.onContextMenu);

        this.editor.setCaretOffset(this.editor.getCharCount());

        Firebug.chrome.applyTextSize(Firebug.textSize);

        if (FBTrace.DBG_COMMANDEDITOR)
            FBTrace.sysout("commandEditor.onEditorLoad; SourceEditor loaded");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Handlers

    onKeyPress: function(event)
    {
        Firebug.CommandLine.update(Firebug.currentContext);

        switch (event.keyCode)
        {
            case KeyEvent.DOM_VK_RETURN:
                if (Events.isControl(event))
                    Firebug.CommandLine.enter(Firebug.currentContext);
            break;

            case KeyEvent.DOM_VK_ESCAPE:
                Firebug.CommandLine.cancel(Firebug.currentContext);
                event.preventDefault();
            break;
        }
    },

    onContextMenu: function(event)
    {
        var popup = document.getElementById("fbCommandEditorPopup");
        Dom.eraseNode(popup);

        var browserWindow = Firebug.chrome.window;
        var commandDispatcher = browserWindow.document.commandDispatcher;

        var items = Firebug.CommandEditor.getContextMenuItems();
        for (var i=0; i<items.length; i++)
            Menu.createMenuItem(popup, items[i]);

        if (!popup.childNodes.length)
            return;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
    },

    getContextMenuItems: function()
    {
        var items = [];
        items.push({label: Locale.$STR("Cut"), commandID: "cmd_cut"});
        items.push({label: Locale.$STR("Copy"), commandID: "cmd_copy"});
        items.push({label: Locale.$STR("Paste"), commandID: "cmd_paste"});
        items.push({label: Locale.$STR("Delete"), commandID: "cmd_delete"});
        items.push("-");
        items.push({label: Locale.$STR("SelectAll"), commandID: "cmd_selectAll"});
        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    setText: function(text)
    {
        if (this.editor)
            this.editor.setText(text);
    },

    getText: function()
    {
        if (this.editor)
            return this.editor.getText();
    },

    setSelectionRange: function(start, end)
    {
        if (this.editor)
            this.editor.setSelection(start, end);
    },

    select: function()
    {
        // TODO xxxHonza
    },

    hasFocus: function()
    {
        try
        {
            if (this.editor)
                return this.editor.hasFocus();
        }
        catch (e)
        {
        }
    },

    fontSizeAdjust: function(adjust)
    {
        if (!this.editor || !this.editor._view)
            return;

        var doc = this.editor._view._frame.contentDocument;
        doc.body.style.fontSizeAdjust = adjust;
    }
});

// ********************************************************************************************* //
// Getters/setters

Firebug.CommandEditor.__defineGetter__("value", function()
{
    return this.getText();
});

Firebug.CommandEditor.__defineSetter__("value", function(val)
{
    this.setText(val);
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.CommandEditor);

return Firebug.CommandEditor;

// ********************************************************************************************* //
});
