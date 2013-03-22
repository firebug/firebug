/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/debuggerLib",
],
function(FBTrace, Str, SourceLink, DebuggerLib) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_SOURCEFILE");

// ********************************************************************************************* //
// Source File

/**
 * SourceFile one for every compilation unit.
 */
function SourceFile(actor, href, startLine, lineCount)
{
    this.compilation_unit_type = "remote-script";

    this.sourceActor = actor;
    this.href = href;
    this.startLine = startLine;
    this.lineCount = lineCount;
}

SourceFile.prototype =
{
    getBaseLineOffset: function()
    {
        return this.startLine;
    },

    getURL: function()
    {
        return this.href;
    },

    toString: function()
    {
        return this.href;
    },

    getSourceLength: function()
    {
        // xxxHonza: TODO
        return 0;
    },

    getLine: function(lineNo)
    {
        if (this.loaded && lineNo >=0 && lineNo < this.lines.length)
            return this.lines[lineNo];

        // xxxHonza: TODO
        return "";
    },

    isExecutableLine: function(lineNo)
    {
        // xxxHonza: TODO
        return false;
    },

    loadScriptLines: function(context, callback)
    {
        // Alway remember the last passed callback that should be executed when the source
        // is loaded. Note that the request-for-source can be already in progress.
        this.callback = callback;

        if (this.loaded)
        {
            this.callback(this.lines);
            return;
        }

        // Ignore if the request-for-source is currently in progress.
        if (this.inProgress)
        {
            Trace.sysout("sourceFile.loadScriptLines; in-progress");
            return;
        }

        this.inProgress = true;

        var self = this;
        var sourceClient = context.activeThread.source(this.sourceActor);
        sourceClient.source(function(response)
        {
            if (response.error)
            {
                TraceError.sysout("sourceFile.loadScriptLines; ERROR " +
                    response.error, response);
                return;
            }

            self.loaded = true;
            self.inProgress = false;
            self.lines = Str.splitLines(response.source);

            self.callback(self.lines);
        });
    },
}

// ********************************************************************************************* //
// Static Methods (aka class methods)

SourceFile.getSourceFileByScript = function(context, script)
{
    if (context.sourceFileMap)
        return context.sourceFileMap[script.url];
};

SourceFile.findScriptForFunctionInContext = function(context, fn)
{
    var dwin = DebuggerLib.getDebuggeeGlobal(context);
    var dfn = dwin.makeDebuggeeValue(fn);
    return dfn.script;
};

SourceFile.findSourceForFunction = function(fn, context)
{
    var script = SourceFile.findScriptForFunctionInContext(context, fn);
    return script ? SourceFile.toSourceLink(script, context) : null;
};

SourceFile.toSourceLink = function(script, context)
{
    var sourceLink = new SourceLink(script.url, script.startLine, "js");

    // Make sure the target line is highlighted.
    sourceLink.options.highlight = true;
    return sourceLink;
};

//xxxHonza: Back comp, do we need this?
SourceFile.getSourceLinkForScript = SourceFile.toSourceLink;

// ********************************************************************************************* //

// xxxHonza: backward compatibility, search the code and fix.
Firebug.SourceFile = SourceFile;

return SourceFile;

// ********************************************************************************************* //
});
