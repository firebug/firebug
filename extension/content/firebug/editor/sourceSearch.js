/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

"use strict";

// ********************************************************************************************* //
// Constants

// Tracing
var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SEARCH");

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
        Trace.sysout("sourceSearch.findNext; text: " + text, options);

        if (options.useRegularExpression)
        {
            text = this.editor.cloneIntoCMScope({
                source: text,
                ignoreCase: options.ignoreCase,
            });
        }

        var rev = options.backwards;
        var editor = this.editor.editorObject;

        if (start == -1)
            start = {line: editor.lastLine()};

        // Don't forget to clone the position object into CM scope (panel.html) that is using
        // limited privileges (not chrome)
        start = this.editor.cloneIntoCMScope(start);

        var wraparound = false;

        // Get the search cursor and find first match. If there is no result, try to
        // search from the begin/end again (if wrap-around is on).
        var cursor = editor.getSearchCursor(text, start, options.ignoreCase);
        if (!cursor.find(rev))
        {
            // Bail out if we don't want wrap search.
            if (!options.wrapSearch)
                return;

            var start = rev ? {line: editor.lastLine()} : null;
            start = this.editor.cloneIntoCMScope(start);

            cursor = editor.getSearchCursor(text, start, rev);
            if (!cursor.find(rev))
                return;

            wraparound = true;
        }

        var result = {
            wraparound: wraparound,
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
