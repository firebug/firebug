/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/css/cssModule",
    "firebug/editor/baseEditor",
    "firebug/editor/editor",
    "firebug/editor/sourceEditor",
],
function(Firebug, FBTrace, Domplate, CSSModule, BaseEditor, Editor, SourceEditor) {

// ********************************************************************************************* //
// Constants

var {DIV} = Domplate;

// ********************************************************************************************* //
// StyleSheetEditor

/**
 * StyleSheetEditor represents the full-sized editor used for Source/Live Edit
 * within the CSS panel.
 */
function StyleSheetEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);

    this.onEditorTextChangeListener = this.onEditorTextChange.bind(this);
    var config = {
        mode: "css",
        readOnly: false,
        gutters: []
    };
    // Initialize source editor, then append to the box.
    this.editor = new SourceEditor();
    this.editor.init(this.box, config, this.onEditorInitialize.bind(this));
}

StyleSheetEditor.prototype = domplate(BaseEditor,
{
    multiLine: true,

    tag: DIV({"class": "styleSheetEditor fullPanelEditor"}),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onEditorInitialize: function()
    {
        this.editor.addEventListener(SourceEditor.Events.textChange,
            this.onEditorTextChangeListener);
    },

    getValue: function()
    {
        return this.editor.getText();
    },

    setValue: function(value)
    {
        return this.editor.setText(value, "css");
    },

    show: function(target, panel, value, textSize)
    {
        this.target = target;
        this.panel = panel;

        // Show the box that editor already is appended to.
        this.panel.panelNode.appendChild(this.box);
        this.editor.setText(value, "css");

        // match CSSModule.getEditorOptionKey
        var command = Firebug.chrome.$("cmd_firebug_togglecssEditMode");
        command.setAttribute("checked", true);
    },

    hide: function()
    {
        var command = Firebug.chrome.$("cmd_firebug_togglecssEditMode");
        command.setAttribute("checked", false);

        if (this.box.parentNode == this.panel.panelNode)
            this.panel.panelNode.removeChild(this.box);

        delete this.target;
        delete this.panel;
        delete this.styleSheet;
    },

    saveEdit: function(target, value, previousValue)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("StyleSheetEditor.saveEdit", arguments);

        CSSModule.freeEdit(this.styleSheet, value);
    },

    beginEditing: function()
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("StyleSheetEditor.beginEditing", arguments);

        this.editing = true;
    },

    endEditing: function()
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("StyleSheetEditor.endEditing", arguments);

        this.editing = false;
        this.panel.refresh();
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onEditorTextChange: function()
    {
        Editor.update();
    },

    scrollToLine: function(line, offset)
    {
        this.editor.scrollToLine(line);
    }
});

// ********************************************************************************************* //
// Registration

// used in Acebug
Firebug.StyleSheetEditor = StyleSheetEditor;

return StyleSheetEditor;

// ********************************************************************************************* //
});