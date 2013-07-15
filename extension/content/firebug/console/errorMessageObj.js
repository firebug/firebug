/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/js/sourceFile",
    "firebug/js/sourceLink",
],
function(Firebug, FBTrace, SourceFile, SourceLink) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //
// ErrorMessageObj Implementation

function ErrorMessageObj(message, href, lineNo, source, category, context,
    trace, msgId, colNumber)
{
    this.message = message;
    this.href = href;
    this.lineNo = lineNo;
    this.source = source;
    this.category = category;
    this.context = context;
    this.trace = trace;
    this.msgId = msgId || this.getId();
    this.colNumber = colNumber;
};

ErrorMessageObj.prototype =
{
    getSourceLine: function()
    {
        if (this.href === null)
            return "";

        if (!this.context.sourceCache)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.ErrorMessageObj.getSourceLine; ERROR no source cache!");
            return "";
        }

        return this.context.sourceCache.getLine(this.href, this.lineNo);
    },

    getSourceLink: function()
    {
        var ext = this.category == "css" ? "css" : "js";
        return this.lineNo ? new SourceLink.SourceLink(this.href, this.lineNo, ext,
            null, null, this.colNumber) : null;
    },

    resetSource: function()
    {
        if (this.href && this.lineNo != null)
            this.source = this.getSourceLine();
    },

    correctWithStackTrace: function(trace)
    {
        var frame = trace.frames[0];
        if (frame)
        {
            this.href = frame.href;
            this.lineNo = frame.line;
            this.trace = trace;
        }
    },

    correctSourcePoint: function(sourceName, lineNumber)
    {
        this.href = sourceName;
        this.lineNo = lineNumber;
    },

    getId: function()
    {
        return this.href + ":" + this.message + ":" + this.lineNo;
    }
};

// ********************************************************************************************* //
// Registration

return ErrorMessageObj;

// ********************************************************************************************* //
});
