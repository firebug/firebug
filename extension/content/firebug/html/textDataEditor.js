/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/editor/inlineEditor"
],
function(Firebug, InlineEditor) {

"use strict";

// ********************************************************************************************* //
// TextDataEditor

/**
 * TextDataEditor deals with text of comments and CData nodes
 */
function TextDataEditor(doc)
{
    this.initializeInline(doc);
}

TextDataEditor.prototype = domplate(InlineEditor.prototype,
{
    saveEdit: function(target, value, previousValue)
    {
        var node = Firebug.getRepObject(target);
        if (!node)
            return;

        target.textContent = value;
        node.data = value;
    }
});

// ********************************************************************************************* //
// Registration

return TextDataEditor;

// ********************************************************************************************* //
});
