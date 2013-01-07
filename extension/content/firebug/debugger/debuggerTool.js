/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/lib/tool",
    "arch/compilationunit",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/remoting/debuggerClientModule",
    "firebug/debugger/grips/gripCache",
    "firebug/trace/traceModule",
    "firebug/trace/traceListener",
    "firebug/debugger/script/sourceFile",
],
function (Obj, Firebug, FBTrace, Arr, Tool, CompilationUnit, StackFrame, StackTrace,
    DebuggerClientModule, GripCache, TraceModule, TraceListener, SourceFile) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_DEBUGGERTOOL");

// ********************************************************************************************* //
// Debugger Tool

/**
 * @module
 */
var DebuggerTool = Obj.extend(Firebug.Module,
/** @lends DebuggerTool */
{
    dispatchName: "JSD2.DebuggerTool",

    toolName: "debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.traceListener = new TraceListener("debuggerTool.", "DBG_DEBUGGERTOOL", false);
        TraceModule.addListener(this.traceListener);

        // Listen to the debugger-client, which represents the connection to the server.
        // The debugger-client object represents the source of all RDP events.
        DebuggerClientModule.addListener(this);

        // Hook XUL stepping buttons.
        var chrome = Firebug.chrome;
        chrome.setGlobalAttribute("cmd_firebug_rerun", "oncommand",
            "Firebug.DebuggerTool.rerun(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "oncommand",
            "Firebug.DebuggerTool.resume(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepOver", "oncommand",
            "Firebug.DebuggerTool.stepOver(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepInto", "oncommand",
            "Firebug.DebuggerTool.stepInto(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepOut", "oncommand",
            "Firebug.DebuggerTool.stepOut(Firebug.currentContext)");

        Trace.sysout("debuggerTool.initialized;");
    },

    shutdown: function()
    {
        TraceModule.removeListener(this.traceListener);

        DebuggerClientModule.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tabs

    onTabNavigated: function()
    {
        this.dispatch("onTabNavigated");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onThreadAttached: function(context, reload)
    {
        Trace.sysout("debuggerTool.onThreadAttached; reload: " + reload, context);

        if (this._onPause)
        {
            TraceError.sysout("debuggerTool.onThreadAttached; ERROR listeners still active!");
        }

        // This is the place where we bind all listeners to the current
        // context so, it's available inside the methods.
        this._onPause = this.paused.bind(this, context);
        this._onDetached = this.detached.bind(this, context);
        this._onResumed = this.resumed.bind(this, context);
        this._onFramesAdded = this.framesadded.bind(this, context);
        this._onFramesCleared = this.framescleared.bind(this, context);
        this._onNewScript = this.newScript.bind(this, context);

        // Add all listeners
        context.activeThread.addListener("paused", this._onPause);
        context.activeThread.addListener("detached", this._onDetached);
        context.activeThread.addListener("resumed", this._onResumed);

        // These events are used to sync with ThreadClient's stack frame cache.
        context.activeThread.addListener("framesadded", this._onFramesAdded);
        context.activeThread.addListener("framescleared", this._onFramesCleared);

        DebuggerClientModule.client.addListener("newScript", this._onNewScript);

        // Create grip cache
        context.gripCache = new GripCache(DebuggerClientModule.client);

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles(context);
    },

    onThreadDetached: function(context)
    {
        Trace.sysout("debuggerTool.onThreadDetached;");

        // Remove all listeners from the current ThreadClient
        context.activeThread.removeListener("paused", this._onPause);
        context.activeThread.removeListener("detached", this._onDetached);
        context.activeThread.removeListener("resumed", this._onResumed);
        context.activeThread.removeListener("framesadded", this._onFramesAdded);
        context.activeThread.removeListener("framescleared", this._onFramesCleared);

        DebuggerClientModule.client.removeListener("newScript", this._onNewScript);

        this._onPause = null;
        this._onDetached = null;
        this._onResumed = null;
        this._onFramesAdded = null;
        this._onFramesCleared = null;
        this._onNewScript = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Script Sources

    updateScriptFiles: function(context)
    {
        var self = this;
        context.activeThread.getScripts(function(response)
        {
            var scripts = response.scripts;
            for (var i=0; i<scripts.length; i++)
                self.addScript(context, scripts[i]);
        });
    },

    newScript: function(context, type, response)
    {
        this.addScript(context, response);
    },

    addScript: function(context, script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // create as the user is evaluating expressions in the watch window.
        if (script.url == "debugger eval code")
            return;

        var s = script;

        // xxxHonza: Ignore inner script for now
        if (context.sourceFileMap[s.url])
            return;

        // Create a source file and append it into the context.
        var sourceFile = new SourceFile(s.source, s.url, s.startLine, s.lineCount);
        context.addSourceFile(sourceFile);

        // Notify listeners (e.g. the Script panel) to updated itself. It can happen
        // that the Script panel has been empty until now and need to display a script.
        this.dispatch("newScript", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Thread Listener

    paused: function(context, event, packet)
    {
        var type = packet.why.type;
        Trace.sysout("debuggerTool.paused; " + type, packet);

        var ignoreTypes = {
            "interrupted": 1,
        };

        if (ignoreTypes[type])
            return;

        context.gripCache.clear();

        context.stopped = true;

        // Asynchronously initializes ThreadClient's stack frame cache. If you want to
        // sync with the cache handle 'framesadded' and 'framescleared' events.
        context.activeThread.fillFrames(50);

        var frame = StackFrame.buildStackFrame(packet.frame, context);

        // the frame we stopped in, don't change this elsewhere.
        context.stoppedFrame = frame;

        // the frame we show to user, depends on selection
        context.currentFrame = frame;

        // Notify listeners. E.g. the {@ScriptPanel} panel needs to update its UI.
        this.dispatch("onStartDebugging", [context, event, packet]);
    },

    resumed: function(context, event, packet)
    {
        Trace.sysout("debuggerTool.resumed; ", arguments);

        context.gripCache.clear();

        context.stopped = false;
        context.stoppedFrame = null;
        context.currentFrame = null;
        context.currentTrace = null;

        this.dispatch("onStopDebugging", [context, event, packet]);
    },

    detached: function(context)
    {
        Trace.sysout("debuggerTool.detached; ", arguments);

        context.gripCache.clear();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Frames

    framesadded: function(context)
    {
        Trace.sysout("debuggerTool.framesadded; ", arguments);

        // Get frames from ThreadClient's stack-frame cache and build stack trace object,
        // which is stored in the context.
        var frames = context.activeThread.cachedFrames;
        context.currentTrace = StackTrace.buildStackTrace(frames, context);

        // Now notify all listeners, for example the {@CallstackPanel} panel to sync the UI.
        this.dispatch("framesadded", [context.currentTrace]);
    },

    framescleared: function(context)
    {
        Trace.sysout("debuggerTool.framescleared; ", arguments);

        context.currentTrace = null;

        this.dispatch("framescleared");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.activeThread)
        {
            FBTrace.sysout("debuggerTool.setBreakpoint; Can't set a breakpoint.");
            return;
        }

        var doSetBreakpoint = function _doSetBreakpoint(response, bpClient)
        {
            Trace.sysout("debuggerTool.onSetBreakpoint; " + bpClient.location.url + " (" +
                bpClient.location.line + ")", bpClient);

            // TODO: error logging?

            // Store breakpoint clients so, we can use the actors to remove the
            // breakpoint later.
            if (!context.breakpointClients)
                context.breakpointClients = [];

            context.breakpointClients.push(bpClient);

            // TODO: update the UI?

            callback(response, bpClient);
        };

        return context.activeThread.setBreakpoint({
            url: url,
            line: lineNumber
        }, doSetBreakpoint);
    },

    setBreakpoints: function(context, arr, cb)
    {
        var thread = context.activeThread;
        if (!thread)
        {
            TraceError.sysout("debuggerTool.setBreakpoints; Can't set breakpoints " +
                "if there is no active thread");
            return;
        }

        var self = this;
        var doSetBreakpoints = function _doSetBreakpoints(callback)
        {
            Trace.sysout("debuggerTool.doSetBreakpoints; ", arr);

            // Iterate all breakpoints and set them step by step. The thread is
            // paused at this point.
            for (var i=0; i<arr.length; i++)
            {
                var bp = arr[i];
                self.setBreakpoint(context, bp.href, bp.lineNo, function(response, bpClient)
                {
                    cb(response, bpClient);
                });
            }

            // xxxHonza: At this point responses are not received yet, is it ok to resume?
            if (callback)
                callback();
        };

        // If the thread is currently paused, go to set all the breakpoints.
        if (thread.paused)
        {
            doSetBreakpoints();
            return;
        }

        // ... otherwise we need to interupt the thread first.
        thread.interrupt(function(response)
        {
            if (response.error)
            {
                TraceError.sysout("debuggerTool.setBreakpoints; Can't set breakpoints: " +
                    response.error);
                return;
            }

            // When the thread is interrupted, we can set all the breakpoints.
            doSetBreakpoints(self.resume.bind(self, context));
        });
    },

    removeBreakpoint: function(context, url, lineNumber, callback)
    {
        if (!context.activeThread)
        {
            FBTrace.sysout("debuggerTool.removeBreakpoint; Can't remove breakpoints.");
            return;
        }

        // We need to get the breakpoint client object for this context. The client.
        // knowns how to remove the breakpoint on the server side.
        var client = this.removeBreakpointClient(context, url, lineNumber);
        if (client)
            client.remove(callback);
    },

    removeBreakpointClient: function(context, url, lineNumber)
    {
        var clients = context.breakpointClients;
        if (!clients)
            return;

        for (var i=0; i<clients.length; i++)
        {
            var client = clients[i];
            var loc = client.location;
            if (loc.url == url && loc.line == lineNumber)
            {
                clients.splice(i, 1);
                return client;
            }
        }
    },

    enableBreakpoint: function(context, url, lineNumber, callback)
    {
        this.setBreakpoint(context, url, lineNumber, callback);
    },

    disableBreakpoint: function(context, url, lineNumber, callback)
    {
        this.removeBreakpoint(context, url, lineNumber, callback);
    },

    isBreakpointDisabled: function(context, url, lineNumber)
    {
        //return JSDebugger.fbs.isBreakpointDisabled(url, lineNumber);
    },

    getBreakpointCondition: function(context, url, lineNumber)
    {
        //return JSDebugger.fbs.getBreakpointCondition(url, lineNumber);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging API

    rerun: function(context)
    {
    },

    resume: function(context, callback)
    {
        return context.activeThread.resume(callback);
    },

    stepOver: function(context, callback)
    {
        return context.activeThread.stepOver(callback);
    },

    stepInto: function(context, callback)
    {
        return context.activeThread.stepIn(callback);
    },

    stepOut: function(context, callback)
    {
        return context.activeThread.stepOut(callback);
    },

    runUntil: function(context, compilationUnit, lineNumber, callback)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stack Trace API

    getCurrentFrame: function(context)
    {
        return context.currentFrame;
    },

    getCurrentTrace: function(context)
    {
        return context.currentTrace;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Evaluation

    eval: function(context, frame, expr)
    {
        Trace.sysout("debuggerTool.eval; " + expr);

        // This operation causes the server side to:
        // 1) Resume the current thread
        // 2) Evaluate the expresion in a new frame
        // 3) Remove the frame and pause
        context.activeThread.eval(frame.getActor(), expr, function(response)
        {
            // Not interested in 'resume' packet. The callback will be executed
            // when 'pause' packet is received, see paused() method.
        });
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool(DebuggerTool);
Firebug.registerModule(DebuggerTool);

// Expose to XUL stepping buttons
Firebug.DebuggerTool = DebuggerTool;

return DebuggerTool;

// ********************************************************************************************* //
});