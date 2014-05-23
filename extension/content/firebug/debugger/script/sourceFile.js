/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/events",
    "firebug/lib/string",
    "firebug/lib/url",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/script/sourceLink",
    "firebug/net/netUtils",
],
function(Firebug, FBTrace, Events, Str, Url, DebuggerLib, SourceLink, NetUtils) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SOURCEFILE");

// ********************************************************************************************* //
// Source File

/**
 * SourceFile instance is created for every compilation unit (i.e. a source created
 * at the back end). The instance is created by {@link SourceTool} every time a "newSource"
 * or the initial "sources" packet is received.
 */
function SourceFile(context, actor, href, isBlackBoxed, isPrettyPrinted)
{
    this.context = context;
    this.actor = actor;

    // SourceFile should not use URL fragment (issue 7251)
    //this.href = Url.normalizeURL(href);
    this.href = href;

    // xxxHonza: this field should be utilized by issue 4885.
    this.isBlackBoxed = isBlackBoxed;
    this.isPrettyPrinted = isPrettyPrinted;

    // The content type is set when 'source' packet is received (see onSourceLoaded).
    this.contentType = null;

    // xxxHonza: refactor the flag logic.
    this.compilation_unit_type = "script_tag";
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

    // xxxHonza: This method should return a promise
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

        // Firebug needs to be attached to the thread client to get sources.
        var threadClient = this.context.activeThread;
        if (!threadClient)
        {
            Trace.sysout("sourceFile.loadScriptLines; ERROR no thread client " + this.href);
            callback(null);
            return;
        }

        // This is the only place where source (the text) is loaded for specific URL.
        var sourceClient = threadClient.source(this);
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
        // See {@link ScriptView.showSource}
        var source = response.source.replace(/\r\n/gm, "\n");

        this.loaded = true;
        this.inProgress = false;
        this.lines = Str.splitLines(source);
        this.contentType = response.contentType;

        // Notify all callbacks.
        for (var i=0; i<this.callbacks.length; i++)
            this.callbacks[i](this.lines);

        // Fire global notification.
        Events.dispatch(Firebug.modules, "onSourceLoaded", [this, this.lines]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Pretty Print

    /**
     * xxxHonza: yet need to be revisited
     */
    togglePrettyPrint: function(cb)
    {
        function callback(response)
        {
            this.onSourceLoaded(response);
            cb();
        }

        callback = callback.bind(this);
        var sourceClient = this.context.activeThread.source(this);

        if (this.isPrettyPrinted)
            sourceClient.disablePrettyPrint(callback);
        else
            sourceClient.prettyPrint(4, callback);

        this.isPrettyPrinted = !this.isPrettyPrinted;
    },

    getCategory: function()
    {
        var mimeType = NetUtils.getMimeType(this.contentType, this.href);
        return NetUtils.getCategory(mimeType);
    },

    getSourceLink: function()
    {
        return new SourceLink(this.href, null, "js");
    }
}

// ********************************************************************************************* //
// Static Methods

SourceFile.getSourceFileByUrl = function(context, url)
{
    return context.getSourceFile(url);
};

SourceFile.findScriptForFunctionInContext = function(context, fn)
{
    var global = Cu.getGlobalForObject(fn);
    var dbgGlobal = DebuggerLib.getThreadDebuggeeGlobalForContext(context, global);
    if (!dbgGlobal)
    {
        Trace.sysout("sourceFile.findScriptForFunctionInContext; no debugger");
        return null;
    }

    var dbgFn = dbgGlobal.makeDebuggeeValue(fn).unwrap();
    if (!dbgFn || !dbgFn.script)
    {
        // This happens e.g. for native functions.
        Trace.sysout("sourceFile.findScriptForFunctionInContext; no script", {
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
    return script ? SourceFile.getSourceLinkForScript(script, context) : null;
};

SourceFile.getSourceLinkForScript = function(script, context)
{
    var sourceLink = new SourceLink(script.url, script.startLine, "js");
    return sourceLink;
};

// ********************************************************************************************* //

// xxxHonza: backward compatibility, search the code and fix.
Firebug.SourceFile = SourceFile;

return SourceFile;

// ********************************************************************************************* //
});
