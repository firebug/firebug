/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
],
function(Firebug, FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var TraceError = FBTrace.to("DBG_ERRORS");

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
}

ErrorMessageObj.prototype =
{
    getSourceLine: function()
    {
        if (!this.context.sourceCache)
        {
            TraceError.sysout("reps.ErrorMessageObj.getSourceLine; ERROR no source cache!");
            return;
        }

        return this.context.sourceCache.getLine(this.href, this.lineNo);
    },

    resetSource: function()
    {
        if (this.href && this.lineNo)
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
