/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string",
    "firebug/lib/events",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/debuggerLib",
],
function(FBTrace, Str, Events, SourceLink, DebuggerLib) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_SOURCEFILE");

// ********************************************************************************************* //
// Source File

/**
 * SourceFile instance is created for every compilation unit (i.e. a script created
 * on the back end). The instance is created by {@DebuggerTool} every time a "newSource"
 * or the initial "sources" packet is received.
 */
function SourceFile(context, actor, href, isBlackBoxed)
{
    this.context = context;
    this.actor = actor;
    this.href = href;

    // xxxHonza: this field should be utilized by issue 4885.
    this.isBlackBoxed = isBlackBoxed;

    // The content type is set when 'source' packet is received (see onSourceLoaded).
    this.contentType = null;

    // xxxHonza: remove
    this.compilation_unit_type = "remote-script";
    this.callbacks = [];
}

SourceFile.prototype =
/** @lends SourceFile */
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
        if (this.loaded)
        {
            callback(this.lines);
            return this.lines;
        }

        // Remember the callback. There can be more callbacks if the script is
        // being loaded and more clients want it.
        this.callbacks.push(callback);

        // Ignore if the request-for-source is currently in progress.
        if (this.inProgress)
        {
            Trace.sysout("sourceFile.loadScriptLines; in-progress " + this.href);
            return;
        }

        Trace.sysout("sourceFile.loadScriptLines; Load source for: " + this.href);

        this.inProgress = true;

        // This is the only place where source (the text) is loaded for specific URL.
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
        this.contentType = response.contentType;

        // Notify all callbacks.
        for (var i=0; i<this.callbacks.length; i++)
            this.callbacks[i](this.lines);

        // Fire also global notification.
        Events.dispatch(Firebug.modules, "onSourceLoaded", [this]);
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
    var dbg = DebuggerLib.getDebuggerForContext(context);
    var dbgGlobal = dbg.addDebuggee(context.getCurrentGlobal());
    var dbgFn = dbgGlobal.makeDebuggeeValue(fn);

    if (!dbgFn || !dbgFn.script)
    {
        TraceError.sysout("sourceFile.findScriptForFunctionInContext; ERROR no script?", {
            fn: fn,
            dbgFn: dbgFn,
        });

        return null;
    }

    return dbgFn.script;
};

SourceFile.findSourceForFunction = function(fn, context)
{
    var script = SourceFile.findScriptForFunctionInContext(context, fn);
    return script ? SourceFile.toSourceLink(script, context) : null;
};

SourceFile.toSourceLink = function(script, context)
{
    var sourceLink = new SourceLink(script.url, script.startLine, "js");
    return sourceLink;
};

//xxxHonza: Back compatibility, do we need this?
SourceFile.getSourceLinkForScript = SourceFile.toSourceLink;

// ********************************************************************************************* //

// xxxHonza: backward compatibility, search the code and fix.
Firebug.SourceFile = SourceFile;

return SourceFile;

// ********************************************************************************************* //
});
