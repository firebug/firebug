/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/chrome/tool",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/debuggerLib",
    "firebug/remoting/debuggerClient",
],
function (Firebug, FBTrace, Obj, Str, Tool, SourceFile, StackFrame, DebuggerLib,
    DebuggerClient) {

// ********************************************************************************************* //
// Documentation

/**
 * This module is responsible for handling events that indicate script creation and
 * populate {@link TabContext} with proper object.
 *
 * The module should be also responsible for handling dynamically evaluated scripts,
 * which is not fully supported by platform (JSD2, RDP).
 *
 * Related platform reports:
 * Bug 911721 - Get type & originator for Debugger.Script object
 * Bug 332176 - eval still uses call site line number as offset for eval'ed code in the year 2013
 *
 * Suggestions for the platform:
 * 1) Missing script type (bug 911721)
 * 2) Wrong URL for dynamic scripts
 * 3) 'newScript' is not sent for dynamic scripts
 */

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SOURCETOOL");

// ********************************************************************************************* //
// Source Tool

function SourceTool(context)
{
    this.context = context;
}

/**
 * @object This tool object is responsible for logic related to sources. It requests sources
 * from the server as well as transforms incoming packets into {@link SourceFile} instances that
 * are stored inside the current {@link TabContext}. Any module can consequently use these sources.
 * For example, the {@link ScriptPanel} is displaying it and the {@link ConsolePanel} displays source
 * lines for logged errors.
 */
SourceTool.prototype = Obj.extend(new Tool(),
/** @lends SourceTool */
{
    dispatchName: "SourceTool",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    onAttach: function(reload)
    {
        Trace.sysout("sourceTool.attach; context ID: " + this.context.getId());

        // Listen for 'newScript' events.
        DebuggerClient.addListener(this);

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles();

        // Hook local thread actor to get notification about dynamic scripts creation.
        this.dynamicSourceCollector = new DynamicSourceCollector(this);
        this.dynamicSourceCollector.attach();
    },

    onDetach: function()
    {
        Trace.sysout("sourceTool.detach; context ID: " + this.context.getId());

        // Clear all fetched source info. All script sources must be fetched
        // from the back end after the thread actor is connected again.
        this.context.clearSources();

        DebuggerClient.removeListener(this);

        this.dynamicSourceCollector.detach();
        this.dynamicSourceCollector = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Implementation

    updateScriptFiles: function()
    {
        Trace.sysout("sourceTool.updateScriptFiles; context id: " + this.context.getId());

        var self = this;
        this.context.activeThread.getSources(function(response)
        {
            // The tool is already destroyed so, bail out.
            if (!self.attached)
                return;

            var sources = response.sources;
            for (var i = 0; i < sources.length; i++)
                self.addScript(sources[i]);
        });
    },

    addScript: function(script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // created e.g. as the user is evaluating expressions in the watch window.
        if (DebuggerLib.isFrameLocationEval(script.url))
        {
            Trace.sysout("sourceTool.addScript; A script ignored " + script.type);
            return;
        }

        if (!this.context.sourceFileMap)
        {
            TraceError.sysout("sourceTool.addScript; ERROR Source File Map is NULL", script);
            return;
        }

        // xxxHonza: Ignore inner scripts for now
        if (this.context.sourceFileMap[script.url])
        {
            Trace.sysout("sourceTool.addScript; A script ignored: " + script.url, script);
            return;
        }

        // Create a source file and append it into the context. This is the only
        // place where an instance of {@link SourceFile} is created.
        var sourceFile = new SourceFile(this.context, script.actor, script.url,
            script.isBlackBoxed);

        this.context.addSourceFile(sourceFile);

        // Notify listeners (e.g. the Script panel) to updated itself. It can happen
        // that the Script panel has been empty until now and need to display a script.
        this.dispatch("newSource", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerClient Handlers

    newSource: function(type, response)
    {
        Trace.sysout("sourceTool.newSource; context id: " + this.context.getId() +
            ", script url: " + response.source.url, response);

        // Ignore scripts coming from different threads.
        // This is because 'newSource' listener is registered in 'DebuggerClient' not
        // in 'ThreadClient'.
        if (this.context.activeThread.actor != response.from)
        {
            Trace.sysout("sourceTool.newSource; coming from different thread");
            return;
        }

        this.addScript(response.source);
    },
});

// ********************************************************************************************* //
// Dynamically Evaluated Scripts (mostly hacks, waiting for bug 911721)

function DynamicSourceCollector(sourceTool)
{
    this.sourceTool = sourceTool;
    this.context = sourceTool.context;
}

/**
 * xxxHonza: workaround for missing RDP 'newSource' packets.
 * 
 * This object uses backend Debugger instance |threadActor.dbg| to hook script creation
 * (onNewScript callback). This way we can collect even all dynamically created scripts
 * (which are currently not send over RDP) and populate the current {@link TabContext}
 * with {@link SourceFile} instances that represent them.
 */
DynamicSourceCollector.prototype =
/** @lends DynamicSourceCollector */
{
    attach: function()
    {
        var dbg = DebuggerLib.getThreadDebugger(this.context);

        // Monkey patch the current debugger.
        this.originalOnNewScript = dbg.onNewScript;
        dbg.onNewScript = this.onNewScript.bind(this);
    },

    detach: function()
    {
        if (!this.originalOnNewScript)
            return;

        var dbg = DebuggerLib.getThreadDebugger(this.context);
        dbg.onNewScript = this.originalOnNewScript;

        this.originalOnNewScript = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onNewScript: function(script)
    {
        if (script.url == "debugger eval code")
            return;

        var dynamicTypes = ["eval", "Function", "handler"];
        var type = script.source.introductionType;

        sysoutScript("dynamicSourceCollector.onNewScript; " + script.url  + " " +
            script.lineCount + ", " + type, script);

        if (dynamicTypes.indexOf(type) != -1)
            this.addScript(script);

        // Don't forget to execute the original logic.
        var dbg = DebuggerLib.getThreadDebugger(this.context);
        this.originalOnNewScript.apply(dbg, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addScript: function(script)
    {
        // xxxHonza: Dynamic scripts don't have URL (see bug 957798), so we need to
        // compute one ourselves. It should have the following form
        // Introduction Script URL + fixed (non URL) key + introductionScriptOffset.
        // The URL should be unique and solid, so created breakpoints work
        // even across Firefox restarts. That's why we need introductionScriptOffset.
        // script.introductionScriptOffset: is the bytecode offset within that script of
        // the introduction call (and so, unique for every dynamic script).
        // xxxHonza: introductionScriptOffset is not yet implemented,
        // using the start Line for now.
        var url = script.source.url;

        // xxxHonza: there should be only one place where instance of SourceFile is created.
        var sourceFile = new SourceFile(this.context, null, url, false);
        this.context.addSourceFile(sourceFile);

        // xxxHonza: duplicated from {@link SourceFile}
        var source = script.source.text.replace(/\r\n/gm, "\n");
        sourceFile.loaded = true;
        sourceFile.inProgress = false;
        sourceFile.lines = Str.splitLines(source);
        sourceFile.contentType = "text/javascript";

        sourceFile.startLine = script.startLine;
        sourceFile.nativeScript = script;
        sourceFile.introductionUrl = script.url;

        this.sourceTool.dispatch("newSource", [sourceFile]);
    },
};

// ********************************************************************************************* //
// StackFrame builder Decorator

var originalBuildStackFrame = StackFrame.buildStackFrame;

/**
 * StackFrame build decorator fixes information related to dynamic scripts.
 * 1) URL - dynamically evaluated scripts uses different URLs derived from the parent
 * script URL.
 *
 * xxxHonza: This can be remove as soon as RDP sends proper URLs dynamic scripts.
 */
function buildStackFrame(frame, context)
{
    var stackFrame = originalBuildStackFrame(frame, context);

    var threadActor = DebuggerLib.getThreadActor(context.browser);
    if (threadActor.state != "paused")
        TraceError.sysout("stackFrame.buildStackFrame; ERROR wrong thread actor state!");

    //xxxHonza: rename: nativeFrame -> framePacket and jsdFrame -> nativeFrame
    var frameActor = threadActor._framePool.get(frame.actor);
    stackFrame.jsdFrame = frameActor.frame;

    var sourceFile = getSourceFileByScript(context, frameActor.frame.script);
    if (sourceFile)
    {
        // Use proper source file that corresponds to the current frame.
        stackFrame.sourceFile = sourceFile;

        // Fix the starting line (subtract the parent offset).
        // See also: https://bugzilla.mozilla.org/show_bug.cgi?id=332176
        //stackFrame.line = frame.where.line - sourceFile.startLine + 1;

        // Use proper (dynamically generated) URL.
        stackFrame.href = sourceFile.href;
    }

    return stackFrame;
}

// Monkey patch the original function.
StackFrame.buildStackFrame = buildStackFrame;

// ********************************************************************************************* //
// Tracing Helpers

// xxxHonza: refactor or remove these tracing helpers
function sysoutScript(msg, script)
{
    FBTrace.sysout(msg, convertScriptObject(script));
}

function convertScriptObject(script)
{
    var props = Obj.getPropertyNames(script);
    var obj = {};

    for (var p in props)
        obj[props[p]] = script[props[p]];

    var children = script.getChildScripts();

    var result = [];
    for (var i in children)
        result.push(convertScriptObject(children[i]));

    return {
        script: obj,
        childScripts: result,
        url: script.url,
        startLine: script.startLine,
        lineCount: script.lineCount,
        sourceStart: script.sourceStart,
        sourceLength: script.sourceLength,
        source: {
            text: script.source.text,
            url: script.source.url,
            introductionType: script.source.introductionType,
        },
        snippet: script.source.text.slice(script.sourceStart, script.sourceStart +
            script.sourceLength)
    };
}

// ********************************************************************************************* //
// Script Helpers

// xxxHonza: optimize the source lookup (there can be a lot of scripts).
function getSourceFileByScript(context, script)
{
    for (var url in context.sourceFileMap)
    {
        var source = context.sourceFileMap[url];
        if (!source.nativeScript)
            continue;

        if (source.nativeScript == script)
            return source;

        var childScripts = source.nativeScript.getChildScripts();
        for (var i in childScripts)
        {
            if (childScripts[i] == script)
                return source;
        }
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerTool("source", SourceTool);

return SourceTool;

// ********************************************************************************************* //
});
