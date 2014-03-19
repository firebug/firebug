/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/events",
    "firebug/lib/string",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/script/sourceLink",
],
function(Firebug, FBTrace, Events, Str, DebuggerLib, SourceFile, SourceLink) {

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
    this.sourceLoaded = !!source;
}

ErrorMessageObj.prototype =
/** @lends ErrorMessageObj */
{
    getSourceLine: function(callback)
    {
        if (this.sourceLoaded)
            return this.source;

        var sourceFile = SourceFile.getSourceFileByUrl(this.context, this.href);
        if (!sourceFile)
        {
            TraceError.sysout("errorMessageObj.getSourceLine; ERROR no source file! " +
                this.href);
            return;
        }

        this.sourceLoading = true;

        return sourceFile.getLine(this.lineNo - 1, (line) =>
        {
            this.sourceLoading = false;
            this.sourceLoaded = true;
            this.source = line;

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
            this.lineNo = parseInt(frame.line, 10);
            this.trace = trace;
        }
    },

    getId: function()
    {
        return this.href + ":" + this.message + ":" + this.lineNo + ":" +
            (this.colNumber ? this.colNumber : "");
    }
};

// ********************************************************************************************* //
// Helper Source Provider

// xxxHonza: we might want to use tge {@link SourceProvider} if the following bug is fixed:
// https://bugzilla.mozilla.org/show_bug.cgi?id=915433

/**
 * Helper source provider used to display source line for errors in case when
 * the Script panel is disabled.
 */
var SourceProvider =
/** @lends SourceProvider */
{
    getSourceLine: function(context, url, lineNo, callback)
    {
        TraceError.sysout("errorMessageObj.SourceProvider.getSourceLine; " +
            url + " (" + lineNo + ")");

        // Create debugger asynchronously, you can't start debugging when
        // a debuggee script is on the stack.
        context.setTimeout(this.onGetSourceLine.bind(this,
            context, url, lineNo, callback));
    },

    onGetSourceLine: function(context, url, lineNo, callback)
    {
        var dbg = DebuggerLib.makeDebuggerForContext(context);
        if (!dbg)
        {
            TraceError.sysout("errorMessageObj.SourceProvider.onGetSourceLine; " +
                "ERROR no debugger");
            return;
        }

        var scripts = dbg.findScripts({url: url, line: lineNo});
        if (!scripts.length)
        {
            Trace.sysout("errorMessageObj.SourceProvider.onGetSourceLine; " +
                "No script at this location " + url + " (" + lineNo + ")");

            DebuggerLib.destroyDebuggerForContext(context, dbg);
            return;
        }

        // xxxHonza: sometimes the top level script is not found (only child script) :-(
        var script = scripts[0];
        var startLine = script.startLine;
        var lines = Str.splitLines(script.source.text);

        Trace.sysout("errorMessageObj.SourceProvider.onGetSourceLine; scripts", scripts);

        // Don't forge to destroy the debugger.
        DebuggerLib.destroyDebuggerForContext(context, dbg);

        // Get particular line of the source code.
        var index = lineNo - startLine;
        if (index < 0 || index >= lines.length)
        {
            Trace.sysout("errorMessageObj.SourceProvider.onGetSourceLine; Line " + lineNo +
                " is out of range " + lines.length, source);
            return;
        }

        var line = lines[index];

        Trace.sysout("errorMessageObj.SourceProvider.onGetSourceLine; " +
            "return source for line: " + lineNo + ", index: " + index +
            ", source start: " + script.startLine, script.source.text);

        if (callback)
            callback(line);

        // Dispatch event with fake sourceFile object as an argument, so the UI
        // (mainly the Console UI) can be updated and the source displayed.
        // See e.g. {@link ErrorMessageUpdater}
        var sourceFile = {
            context: context,
            href: url,
            loaded: true,
            lines: lines,
            isBlackBoxed: false,
        };

        Events.dispatch(Firebug.modules, "onUpdateErrorObject", [sourceFile]);

        return line;
    },
}

// ********************************************************************************************* //
// Registration

return ErrorMessageObj;

// ********************************************************************************************* //
});
