/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/chrome/menu",
    "firebug/editor/baseEditor",
    "firebug/editor/editor",
    "firebug/editor/sourceEditor",
],
function(Firebug, FBTrace, Domplate, Dom, Locale, Events, Menu, BaseEditor, Editor, SourceEditor) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV} = Domplate;

var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// HTMLEditor

/**
 * @object This object is used for direct HTML source editing. The feature can be activated
 * by clicking on 'Edit' button within the HTML panel.
 */
function HTMLEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);

    this.onTextChangeListener = this.onTextChange.bind(this);
    this.onContextMenuListener = this.onContextMenu.bind(this);

    var config = {
        mode: "htmlmixed",
        readOnly: false,
        gutters: []
    };

    // Initialize the source editor.
    this.editor = new SourceEditor();
    this.editor.init(this.box, config, this.onHTMLEditorInitialize.bind(this));
}

HTMLEditor.prototype = domplate(BaseEditor,
/** @lends HTMLEditor */
{
    multiLine: true,
    tabNavigation: false,
    arrowCompletion: false,

    internalChange: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate

    tag:
        DIV({"class": "styleSheetEditor fullPanelEditor"}),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onHTMLEditorInitialize: function()
    {
        this.editor.addEventListener(SourceEditor.Events.textChange,
            this.onTextChangeListener);

        this.editor.addEventListener(SourceEditor.Events.contextMenu,
            this.onContextMenuListener);
    },

    getValue: function()
    {
        return this.editor.getText();
    },

    setValue: function(value)
    {
        this.internalChange = true;
        try
        {
            this.editor.setText(value, "htmlmixed");
        }
        finally
        {
            this.internalChange = false;
        }
    },

    show: function(target, panel, value, textSize)
    {
        this.target = target;
        this.panel = panel;
        var el = target.repObject;

        if (this.innerEditMode)
        {
            this.editingParent = el;
        }
        else
        {
            this.editingRange = el.ownerDocument.createRange();
            this.editingRange.selectNode(el);
            this.originalLocalName = el.localName;
        }

        // Append the editor to the DIV(box);
        this.panel.panelNode.appendChild(this.box);
        this.setValue(value);

        // Give it focus initially (and note that if editing is triggered through
        // the toolbar button, we might also need to focus the Firebug chrome).
        Firebug.chrome.focus();
        this.editor.focus();

        var command = Firebug.chrome.$("cmd_firebug_toggleHTMLEditing");
        command.setAttribute("checked", true);
    },

    hide: function()
    {
        var command = Firebug.chrome.$("cmd_firebug_toggleHTMLEditing");
        command.setAttribute("checked", false);

        this.panel.panelNode.removeChild(this.box);

        delete this.editingParent;
        delete this.editingRange;
        delete this.originalLocalName;
        delete this.target;
        delete this.panel;
    },

    getNewSelection: function(fragment)
    {
        // Get a new element to select in the HTML panel. An element with the
        // same localName is preferred, or just any element. If there is none,
        // we choose the parent instead.
        var found = null;
        var nodes = fragment.childNodes;

        for (var i = 0; i < nodes.length; i++)
        {
            var n = nodes[i];
            if (n.nodeType === Node.ELEMENT_NODE)
            {
                if (n.localName === this.originalLocalName)
                    return n;
                if (!found)
                    found = n;
            }
        }

        if (found)
            return found;

        return this.editingRange.startContainer;
    },

    saveEdit: function(target, value, previousValue)
    {
        if (this.innerEditMode)
        {
            try
            {
                this.editingParent.innerHTML = value;
            }
            catch (e)
            {
                // "can't access dead object" exceptions mostly.
                TraceError.sysout("htmlPanel.saveEdit; EXCEPTION " + e, e);
            }
        }
        else
        {
            try
            {
                var range = this.editingRange;
                var fragment = range.createContextualFragment(value);
                var sel = this.getNewSelection(fragment);

                var cnl = fragment.childNodes.length;
                range.deleteContents();
                range.insertNode(fragment);
                var sc = range.startContainer, so = range.startOffset;
                range.setEnd(sc, so + cnl);

                this.panel.select(sel, false, true);

                // Clear and update the status path, to make sure it doesn't
                // show elements no longer in the DOM.
                Firebug.chrome.clearStatusPath();
                Firebug.chrome.syncStatusPath();
            }
            catch (e)
            {
                TraceError.sysout("HTMLEditor.saveEdit; EXCEPTION " + e, e);
            }
        }
    },

    endEditing: function()
    {
        //this.panel.markChange();
        this.panel.setEditEnableState(true);
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Handlers

    onTextChange: function()
    {
        if (!this.internalChange)
            Editor.update();
    },

    onContextMenu: function(event)
    {
        // Avoid dispatching to {@FirebugChrome.onContextShowing}
        Events.cancelEvent(event);

        var popup = document.getElementById("fbCommandEditorPopup");
        Dom.eraseNode(popup);

        var items = this.editor.getContextMenuItems();
        Menu.createMenuItems(popup, items);

        if (!popup.childNodes.length)
            return;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
    },
});

// ********************************************************************************************* //
// Registration

return HTMLEditor;

// ********************************************************************************************* //
});
