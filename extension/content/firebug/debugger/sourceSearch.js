/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants



// ********************************************************************************************* //
// Module

function SourceSearch(editor)
{
    this.editor = editor;
}

SourceSearch.prototype.findNext = function(text, start, options)
{
    var editor = this.editor.editorObject;
    var cursor = editor.getSearchCursor(text, start, options.ignoreCase);
    if (!cursor.find(options.backwards))
        return null;

    return {start: cursor.from(), end: cursor.to()};
};

// ********************************************************************************************* //
// Registration

return SourceSearch;

// ********************************************************************************************* //
});
