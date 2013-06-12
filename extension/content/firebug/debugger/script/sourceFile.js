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
function SourceFile(context, actor, href)
{
    this.context = context;
    this.actor = actor;
    this.href = href;

    // xxxHonza: remove
    this.compilation_unit_type = "remote-script";
}

SourceFile.prototype =
{
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

    getLine: function(lineNo, callback)
    {
        if (this.loaded)
        {
            if (lineNo >=0 && lineNo < this.lines.length)
            {
                var source = this.lines[lineNo];
                if (callback)
                    callback(source);

                return source;
            }

            Trace.sysout("sourceFile.getLine; Line number is out of scope!");
            return;
        }

        this.loadScriptLines(function(lines)
        {
            var line;
            if (lineNo >=0 && lineNo < lines.length)
                line = lines[lineNo];

            if (callback)
                callback(line);
        });
    },

    isExecutableLine: function(lineNo)
    {
        // xxxHonza: TODO
        return false;
    },

    loadScriptLines: function(callback)
    {
        // Always remember the last passed callback that should be executed when the source
        // is loaded. Note that the request-for-source can be already in progress.
        // xxxHonza: this doesn't sound right.
        this.callback = callback;

        if (this.loaded)
        {
            this.callback(this.lines);
            return this.lines;
        }

        // Ignore if the request-for-source is currently in progress.
        if (this.inProgress)
        {
            Trace.sysout("sourceFile.loadScriptLines; in-progress");
            return;
        }

        Trace.sysout("sourceFile.loadScriptLines;");

        this.inProgress = true;

        var sourceClient = this.context.activeThread.source(this);
        sourceClient.source(this.onSourceLoaded.bind(this));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private Helpers

    onSourceLoaded: function(response)
    {
        Trace.sysout("sourceFile.onSourceLoaded; response:", response);

        if (response.error)
        {
            TraceError.sysout("sourceFile.onSourceLoaded; ERROR " +
                response.error, response);
            return;
        }

        // Convert all line delimiters to the unix style. The source editor
        // (in the Script panel) also uses unix style and so we can compare
        // if specific text is already set in the editor.
        // See {@ScriptView.showSource}
        var source = response.source.replace(/\r\n/gm, "\n");

        this.loaded = true;
        this.inProgress = false;
        this.lines = Str.splitLines(source);

        this.callback(this.lines);
    }
}

// ********************************************************************************************* //
// Static Methods (aka class methods)

SourceFile.getSourceFileByUrl = function(context, url)
{
    if (context.sourceFileMap)
        return context.sourceFileMap[url];
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
