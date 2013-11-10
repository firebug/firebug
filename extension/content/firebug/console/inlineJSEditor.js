/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/console/autoCompleter",
    "firebug/editor/editor",
    "firebug/editor/inlineEditor",
],
function(Firebug, Domplate, Events, JSAutoCompleter, Editor, InlineEditor) {

"use strict";

// ********************************************************************************************* //
// JSEditor - an abstract editor with simple JavaScript auto-completion.

function JSEditor()
{
}

JSEditor.prototype = Domplate.domplate(InlineEditor.prototype,
{
    setupCompleter: function(completionBox, options)
    {
        this.tabNavigation = false;
        this.arrowCompletion = false;
        this.fixedWidth = true;
        this.completionBox = completionBox;

        this.autoCompleter = new EditorJSAutoCompleter(this.input, this.completionBox, options);
    },

    updateLayout: function()
    {
        // Make sure the completion box stays in sync with the input box.
        InlineEditor.prototype.updateLayout.apply(this, arguments);
        this.completionBox.style.width = this.input.style.width;
        this.completionBox.style.height = this.input.style.height;
    },

    destroy: function()
    {
        this.autoCompleter.destroy();
        InlineEditor.prototype.destroy.call(this);
    },

    onKeyPress: function(event)
    {
        var context = this.panel.context;

        if (this.getAutoCompleter().handleKeyPress(event, context))
            return;

        if (event.keyCode === KeyEvent.DOM_VK_TAB ||
            event.keyCode === KeyEvent.DOM_VK_RETURN)
        {
            Editor.stopEditing();
            Events.cancelEvent(event);
        }
    },

    onInput: function()
    {
        var context = this.panel.context;
        this.getAutoCompleter().complete(context);
        Editor.update();
    }
});

function EditorJSAutoCompleter(box, completionBox, options)
{
    var ac = new JSAutoCompleter(box, completionBox, options);

    this.destroy = ac.shutdown.bind(ac);
    this.reset = ac.reset.bind(ac);
    this.handleKeyPress = ac.handleKeyPress.bind(ac);
    this.complete = function(context)
    {
        ac.complete(context, false);
    };
}

// ********************************************************************************************* //
// Registration

Firebug.JSEditor = JSEditor;
return JSEditor;

// ********************************************************************************************* //
});
