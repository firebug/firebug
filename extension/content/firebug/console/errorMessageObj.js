/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/script/sourceLink",
],
function(Firebug, FBTrace, SourceFile, SourceLink) {

"use strict"

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_ERRORLOG");

// ********************************************************************************************* //
// ErrorMessageObj Implementation

/**
 * @object This object collects data about an error that happens in the content. It's used
 * by {@ErrorMessage} Domplate template as the data source.
 */
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
    getSourceLine: function(callback)
    {
        if (this.source)
            return this.source;

        var sourceFile = SourceFile.getSourceFileByUrl(this.context, this.href);
        if (!sourceFile)
        {
            TraceError.sysout("errorMessageObj.getSourceLine; ERROR no source file!");
            return;
        }

        this.sourceLoading = true;

        var self = this;
        sourceFile.getLine(this.lineNo - 1, function(line)
        {
            self.sourceLoading = false;
            self.source = line;

            if (callback)
                callback(line);
        });
    },

    getSourceLink: function()
    {
        var ext = this.category == "css" ? "css" : "js";
        return this.lineNo ? new SourceLink(this.href, this.lineNo, ext,
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
        return this.href + ":" + this.message + ":" + this.lineNo + ":" +
            (this.colNumber ? this.colNumber : "");
    }
};

// ********************************************************************************************* //
// Registration

return ErrorMessageObj;

// ********************************************************************************************* //
});
