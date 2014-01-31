/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

"use strict";

// ********************************************************************************************* //
// Constants

// xxxHonza: move this entire module into firebug/editor directory

// ********************************************************************************************* //
// Implementation

function SourceSearch(editor)
{
    this.editor = editor;
}

/**
 * Helper object for searching within {@link SourceEditor}.
 */
SourceSearch.prototype =
/** @lends SourceSearch */
{
    findNext: function(text, start, options)
    {
        var editor = this.editor.editorObject;
        var cursor = editor.getSearchCursor(text, start, options.ignoreCase);

        if (!cursor.find(options.backwards))
            return null;

        var result = {
            start: cursor.from(),
            end: cursor.to()
        };

        return result;
    }
};

// ********************************************************************************************* //
// Registration

return SourceSearch;

// ********************************************************************************************* //
});
