/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/options",
],
function(Firebug, FBTrace, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

function HTMLEditorSearch(reverse, text, editor)
{
    this.text = text;
    this.editor = editor.editor;
    this.start = reverse ? -1 : 0;
    this.noMatch = false;
}

HTMLEditorSearch.prototype =
{
    find: function(reverse, caseSensitive)
    {
        var options =
        {
            ignoreCase: !caseSensitive,
            backwards: reverse,
            wrapSearch: true,
            useRegularExpression: Options.get("searchUseRegularExpression"),
            start: this.start
        };

        this.noMatch = false;

        var offsets = this.editor.search(this.text, options);
        if (!offsets)
        {
            this.noMatch = true;
            return false;
        }

        this.start = reverse ? offsets.start : offsets.end;
        return offsets.wraparound;
    }
}

// ********************************************************************************************* //
// Registration

return HTMLEditorSearch;

// ********************************************************************************************* //
});
