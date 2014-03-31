/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/url",
    "firebug/lib/xpath",
    "firebug/chrome/tool",
    "firebug/console/errorStackTraceObserver",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/debugger/breakpoints/breakpointTool",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/debuggerLib",
    "firebug/remoting/debuggerClient",
    "arch/compilationunit",
],
function (Firebug, FBTrace, Obj, Str, Url, Xpath, Tool, ErrorStackTraceObserver,
    BreakpointStore, BreakpointTool, SourceFile, StackFrame, DebuggerLib,
    DebuggerClient, CompilationUnit) {

"use strict";

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

var dynamicTypesMap = {
    "eval": CompilationUnit.EVAL,
    "Function": CompilationUnit.EVAL,
    "eventHandler": CompilationUnit.BROWSER_GENERATED,
    "scriptElement": CompilationUnit.EVAL,
    "setTimeout": CompilationUnit.EVAL,
    "setInterval": CompilationUnit.EVAL
};

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

        // Listen for {@link BreakpointStore} events to create custom dynamic breakpoints.
        // (i.e. breakpoints in dynamically created scripts).
        BreakpointStore.addListener(this);
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

        BreakpointStore.removeListener(this);
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
            Trace.sysout("sourceTool.addScript; A script ignored " + script.type +
                ", " + script.url, script);
            return;
        }

        // xxxHonza: Ignore inner scripts for now
        if (this.context.getSourceFile(script.url))
        {
            Trace.sysout("sourceTool.addScript; A script ignored: " + script.url, script);
            return;
        }

        // Create a source file and append it into the context. This is the only
        // place where an instance of {@link SourceFile} is created.
        var sourceFile = new SourceFile(this.context, script.actor, script.url,
            script.isBlackBoxed, script.isPrettyPrinted);

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
            Trace.sysout("sourceTool.newSource; coming from different thread " +
                response.source.url + ", " + this.context.activeThread.actor + " != " +
                response.from, response);
            return;
        }

        this.addScript(response.source);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BreakpointStore Event Listener

    onAddBreakpoint: function(bp)
    {
        var sourceFile = this.context.getSourceFile(bp.href);

        Trace.sysout("sourceTool.onAddBreakpoint; " + bp.href, sourceFile);

        // The code creates dynamic breakpoints only in dynamic scripts.
        if (!sourceFile || !sourceFile.dynamic)
            return;

        var sourceFile = this.context.getSourceFile(bp.href);
        var scripts = sourceFile.scripts;
        if (!scripts.length)
        {
            TraceError.sysout("sourceTool.onAddBreakpoint; ERROR no script object!");
            return;
        }

        bp.params.dynamicHandler = new BreakpointHitHandler(this.context, bp);

        // Set the breakpoint in all scripts associated with the same URL
        // as the breakpoint.
        for (var parentScript of scripts)
        {
            var childScripts = parentScript.getChildScripts();

            var scripts = [parentScript];
            scripts.push.apply(scripts, childScripts);

            for (var script of scripts)
            {
                var offsets = script.getLineOffsets(bp.lineNo + parentScript.startLine);
                if (offsets.length > 0)
                {
                    // Clear first to avoid duplicities.
                    script.clearBreakpoint(bp.params.dynamicHandler);
                    script.setBreakpoint(offsets[0], bp.params.dynamicHandler);
                }
            }
        }
    },

    onRemoveBreakpoint: function(bp)
    {
        var sourceFile = this.context.getSourceFile(bp.href);

        Trace.sysout("sourceTool.onRemoveBreakpoint; " + bp.href, sourceFile);

        if (!sourceFile || !sourceFile.dynamic)
            return;

        if (!bp.params.dynamicHandler)
        {
            TraceError.sysout("sourceTool.onRemoveBreakpoint; No hit handler!");
            return;
        }

        var sourceFile = this.context.getSourceFile(bp.href);
        var scripts = sourceFile.scripts;
        if (!scripts.length)
        {
            TraceError.sysout("sourceTool.onRemoveBreakpoint; ERROR no script object!");
            return;
        }

        for (var parentScript of scripts)
        {
            var childScripts = parentScript.getChildScripts();

            var scripts = [parentScript];
            scripts.push.apply(scripts, childScripts);

            for (var script of scripts)
            {
                var offsets = script.getLineOffsets(bp.lineNo + parentScript.startLine);
                if (offsets.length > 0)
                    script.clearBreakpoint(bp.params.dynamicHandler);
            }
        }
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
        if (dbg)
            dbg.onNewScript = this.originalOnNewScript;

        this.originalOnNewScript = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onNewScript: function(script)
    {
        var dbg = DebuggerLib.getThreadDebugger(this.context);

        if (script.url == "debugger eval code")
            return this.originalOnNewScript.apply(dbg, arguments);

        var introType = script.source.introductionType;

        // xxxHonza: ugh, I don't know how to distinguish between static scriptElement
        // scripts and those who are dynamically created.
        // Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=983297
        if (introType == "scriptElement")
        {
            // xxxHonza: another workaround, a script element is appended
            // dynamically if the parent document state is already set to 'complete'.
            // Also <script> elements with external scripts (src attribute set) are
            // not considered as dynamic scripts here (we'll get 'newScript' event
            // from the backend for those).
            var element = script.source.element.unsafeDereference();
            var state = element.ownerDocument.readyState;
            var srcAttr = element.getAttribute("src");
            if (state != "complete" || srcAttr)
            {
                Trace.sysout("sourceTool.onNewScript; Could be dynamic script, " +
                    "but we can't be sure. See bug 983297 " + script.url + ", " +
                    introType, script);

                return this.originalOnNewScript.apply(dbg, arguments);
            }
        }

        var scriptType = dynamicTypesMap[introType];
        if (scriptType)
        {
            try
            {
                this.addDynamicScript(script, scriptType);
            }
            catch (err)
            {
                TraceError.sysout("sourceToo.onNewScript; ERROR " + err, err);
            }
        }
        else
        {
            Trace.sysout("sourceTool.onNewScript; (non dynamic) " + script.source.url + ", " +
                introType, script);
        }

        // Don't forget to execute the original logic.
        this.originalOnNewScript.apply(dbg, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addDynamicScript: function(script, type)
    {
        // Dynamic scripts use unique URL that is composed from script's location
        // such as line and column number.
        var url = computeDynamicUrl(script);

        // Tracing logs the script object itself and it can take a lot of memory
        // in case of bigger dynamic web applications.
        if (Trace.active)
        {
            var element = script.source.element;
            if (element)
                element = element.unsafeDereference();

            var introType = script.source.introductionType;

            Trace.sysout("sourceTool.addDynamicScript; " + script.source.url + ", " +
                introType, script);
        }

        // Get an existing instance of {@link SourceFile} by URL. We don't want to create
        // a new instance for every dynamic script created from the same source. This is why
        // dynamic script URLs should be uniquely generated according to the script location.
        var sourceFile = this.context.getSourceFile(url);
        if (!sourceFile)
        {
            // xxxHonza: there should be only one place where instance of SourceFile is created.
            var sourceFile = new SourceFile(this.context, null, url, false, false);

            // xxxHonza: duplicated from {@link SourceFile}
            var source = script.source.text.replace(/\r\n/gm, "\n");
            sourceFile.loaded = true;
            sourceFile.inProgress = false;
            sourceFile.lines = Str.splitLines(source);
            sourceFile.contentType = "text/javascript";
            sourceFile.startLine = script.startLine;
            sourceFile.compilation_unit_type = type;

            // xxxHonza: compilation_unit_type should be used
            sourceFile.dynamic = true;

            this.context.addSourceFile(sourceFile);
        }

        // Register new script object in the source file object, before "newSource" event.
        // This way bp.params.dynamicHandler is set for dynamic breakpoints and filtered
        // out during standard breakpoint initialization within:
        // {@link BreakpointTool.newSource}.
        this.registerScript(sourceFile, script);

        // New source file created, so let the rest of the system to deal with it just
        // like with any other (non dynamic) source file.
        this.sourceTool.dispatch("newSource", [sourceFile]);
    },

    registerScript: function(sourceFile, script)
    {
        if (!sourceFile.scripts)
            sourceFile.scripts = [];

        var index = sourceFile.scripts.indexOf(script);
        if (index != -1)
        {
            TraceError.sysout("sourceTool.addScript; ERROR Script already registered! " +
                script.url);
            return;
        }

        sourceFile.scripts.push(script);

        // Initialize breakpoints for the new script.
        var bps = BreakpointStore.getBreakpoints(sourceFile.href);
        for (var bp of bps)
            this.sourceTool.onAddBreakpoint(bp);
    }
};

// ********************************************************************************************* //
// Breakpoint Hit Handler

// xxxHonza: what if we used the BreakpointActor object here on the client side?
// It could safe a lot of the code.
function BreakpointHitHandler(context, bp)
{
    this.context = context;
    this.bp = bp;
}

BreakpointHitHandler.prototype =
{
    hit: function(frame)
    {
        if (this.bp && this.bp.condition)
        {
            // Copied from firebug/debugger/actors/breakpointActor
            if (!DebuggerLib.evalBreakpointCondition(frame, this.bp))
                return;
        }

        var threadActor = DebuggerLib.getThreadActor(this.context.browser);

        var {url} = threadActor.synchronize(
            threadActor.sources.getOriginalLocation({
                url: this.bp.href,
                line: this.bp.lineNo,
                column: 0
            })
        );

        if (threadActor.sources.isBlackBoxed(this.bp.href) || frame.onStep)
        {
            Trace.sysout("sourceTool.hit; can't pause");
            return undefined;
        }

        Trace.sysout("sourceTool.hit; Dynamic breakpoint hit! " +
            this.bp.href + ", " + this.bp.lineNo, frame);

        // Send "pause" packet with a new "dynamic-breakpoint" type.
        // The debugging will start as usual within {@link DebuggerTool#paused} method.
        return threadActor._pauseAndRespond(frame, "dynamic-breakpoint");
    }
}

// ********************************************************************************************* //
// StackFrame builder Decorator

var originalBuildStackFrame = StackFrame.buildStackFrame;

/**
 * StackFrame build decorator fixes information related to dynamic scripts.
 * 1) URL - dynamically evaluated scripts uses different URLs derived from the parent
 * script URL.
 *
 * xxxHonza: This can be removed as soon as RDP sends proper URLs for dynamic scripts.
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

    var script = frameActor.frame.script;
    var sourceFile = getSourceFileByScript(context, script);
    if (!sourceFile)
    {
        // Useful log, but appearing too much in the tracing console.
        Trace.sysout("sourceTool.buildStackFrame; no dynamic script for: " +
             stackFrame.href + " (" + stackFrame.line + ")", script);

        return stackFrame;
    }

    if (sourceFile)
    {
        // Use proper source file that corresponds to the current frame.
        stackFrame.sourceFile = sourceFile;

        // Use proper (dynamically generated) URL.
        stackFrame.href = sourceFile.href;

        // xxxHonza: line numbers seem to be wrong for 'scriptElement' scripts,
        // but only for those that are injected into the page using textContent
        // var script = document.createElement("script");
        // script.textContent = source;
        // document.body.appendChild(scriptTag);
        // https://bugzilla.mozilla.org/show_bug.cgi?id=982153
        if (script.source.introductionType == "scriptElement")
        {
            var element = DebuggerLib.unwrapDebuggeeValue(script.source.element);
            var src = element.getAttribute("src");
            if (!src)
            {
                Trace.sysout("sourceToo.buildStackFrame; Adjusting line number + 1", script);

                stackFrame.line += 1;
            }
        }
    }

    Trace.sysout("sourceTool.buildStackFrame; New frame: " + stackFrame.href +
        " (" + stackFrame.line + ")", stackFrame);

    return stackFrame;
}

// Monkey patch the original function.
StackFrame.buildStackFrame = buildStackFrame;

// ********************************************************************************************* //
// ErrorStackTraceObserver

/**
 * Monkey path the {@link ErrorStackTraceObserver} that is responsible for collecting
 * error stack traces. We need to provide correct stacks (remap URLs) for errors too.
 */
var originalGetSourceFile = ErrorStackTraceObserver.getSourceFile;
ErrorStackTraceObserver.getSourceFile = function(context, script)
{
    var introType = script.source.introductionType;
    var scriptType = dynamicTypesMap[introType];
    if (scriptType)
        return getSourceFileByScript(context, script);

    return originalGetSourceFile.apply(ErrorStackTraceObserver, arguments);
}

// ********************************************************************************************* //
// Script Helpers

// xxxHonza: optimize the source lookup (there can be a lot of scripts).
function getSourceFileByScript(context, script)
{
    var result = context.enumerateSourceFiles(function(source)
    {
        if (!source.scripts)
            return;

        // Walk the tree
        if (hasChildScript(source.scripts, script))
            return source;
    });

    return result;
}

function hasChildScript(scripts, script)
{
    if (scripts.indexOf(script) != -1)
        return true;

    for (var parentScript of scripts)
    {
        var childScripts = parentScript.getChildScripts();
        if (!childScripts.length)
            continue;

        if (hasChildScript(childScripts, script))
            return true;
    }

    return false;
}

function computeDynamicUrl(script)
{
    // If //# sourceURL is provided just use it. Use introduction URL as the
    // base URL if sourceURL is relative.
    // xxxHonza: displayURL for Functions is set asynchronously, why?.
    var displayURL = script.source.displayURL;
    if (displayURL)
    {
        if (Url.isAbsoluteUrl(displayURL))
            return displayURL;

        var introScript = script.source.introductionScript;
        if (!introScript)
        {
            // xxxHonza: hide this, scriptElement scripts don't have introductionScript.
            //TraceError.sysout("sourceTool.computeDynamicUrl; ERROR No introductionScript: " +
            //    script.source.url);
            return Url.normalizeURL(script.source.url + "/" + displayURL);displayURL;
        }

        return Url.normalizeURL(introScript.url + "/" + displayURL);
    }

    // Compute unique URL from location information. We don't want to use any
    // random numbers or counters since breakpoints derive URLs too and they
    // should be persistent.
    // xxxHonza: It might still happen that a lot of breakpoints could stay in
    // the {@link BreakpointStore} using invalid location that changed during
    // development. These dead breakpoints could slow down the BreakpointStore.
    // Additional auto clean logic might be needed, something like:
    // If an URL is not loaded within a week or two, remove all breakpoints
    // associated with that URL.
    var url = script.source.url;
    var element = script.source.element;
    if (element)
        element = element.unsafeDereference();

    var id = getElementId(script);

    var type = script.source.introductionType;
    switch (type)
    {
    case "eventHandler":
        return url + id + " " + element.textContent;

    case "scriptElement":
        // xxxHonza: how else we could identify a <script> based Script if ID attribute
        // is not set and the xpath is like script[2]?
        return url + id;

    case "eval":
    case "Function":
        // xxxHonza: TODO These URLs are already unique, but will be removed (see Bug 977255)
        return url;
    }

    return url;
}

function getElementId(script)
{
    var element = script.source.element;
    if (!element)
        return "";

    if (element)
        element = element.unsafeDereference();

    var attrName = script.source.elementAttributeName || "";

    var id = element.getAttribute("id");
    if (id)
        return "/" + id + " " + attrName;

    return Xpath.getElementTreeXPath(element) + " " + attrName;
}

// ********************************************************************************************* //
// Registration

Firebug.registerTool("source", SourceTool);

return SourceTool;

// ********************************************************************************************* //
});
