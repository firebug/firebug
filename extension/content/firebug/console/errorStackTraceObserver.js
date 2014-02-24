/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/chrome/module",
    "firebug/chrome/tabWatcher",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
    "firebug/remoting/debuggerClient",
],
function(Firebug, Obj, FBTrace, Options, Module, TabWatcher, DebuggerLib, StackFrame, StackTrace,
    DebuggerClient) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_ERRORLOG");

// ********************************************************************************************* //
// ErrorStackTraceObserver Module

/**
 * @module Uses JSD2 Debugger to observe errors and store stack traces for them.
 *
 * Causes some additional performance penalty, especially when exceptions are involved.
 */
var ErrorStackTraceObserver = Obj.extend(Module,
/** @lends ErrorStackTraceObserver */
{
    dispatchName: "ErrorStackTraceObserver",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        DebuggerClient.addListener(this);
    },

    shutdown: function()
    {
        DebuggerClient.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        if (name == "showStackTrace")
            TabWatcher.iterateContexts(this.updateObservation.bind(this));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // JSD2

    updateObservation: function(context)
    {
        var start = context.isPanelEnabled("script") && context.activeThread &&
            Options.get("showStackTrace");

        if (start)
            this.startObserving(context);
        else
            this.stopObserving(context);
    },

    onThreadAttached: function(context)
    {
        this.updateObservation(context);
    },

    onThreadDetached: function(context)
    {
        this.stopObserving(context);
    },

    startObserving: function(context)
    {
        Trace.sysout("errorStackTraceObserver.startObserving; " + context.getName());

        if (context.errorStackTraceDbg)
            return;

        var dbg = DebuggerLib.makeDebuggerForContext(context);
        context.errorStackTraceDbg = dbg;
        this.clearState(context);

        dbg.onExceptionUnwind = this.onExceptionUnwind.bind(this, context);
    },

    stopObserving: function(context)
    {
        Trace.sysout("errorStackTraceObserver.stopObserving; " + context.getName());

        if (!context.errorStackTraceDbg)
            return;

        try
        {
            DebuggerLib.destroyDebuggerForContext(context, context.errorStackTraceDbg);
        }
        catch (err)
        {
            TraceError.sysout("errorStackTraceObserver.stopObserving; EXCEPTION " + err, err);
        }
        context.errorStackTraceDbg = null;
        context.errorStackTraceState = null;
    },

    clearState: function(context) {
        Trace.sysout("errorStackTraceObserver.clearState");
        context.errorStackTraceState = {
            olderFrame: null,
            scripts: [],
            offsets: [],
            frameNames: [],
            argCopies: [],
        };
    },

    getAndConsumeStackTrace: function(context)
    {
        var trace = context.errorStackTrace;
        context.errorStackTrace = undefined;
        return trace;
    },

    createStackTrace: function(context)
    {
        var trace = new StackTrace();

        var state = context.errorStackTraceState;
        for (var i = 0; i < state.scripts.length; i++)
        {
            var script = state.scripts[i];
            var sourceFile = context.sourceFileMap[script.url];
            if (!sourceFile)
                sourceFile = {href: script.url};

            var line = script.getOffsetLine(state.offsets[i]);
            var args = state.argCopies[i];

            var stackFrame = new StackFrame(sourceFile, line, state.frameNames[i],
                args, null, 0, context);
            trace.frames.push(stackFrame);
        }

        Trace.sysout("errorStackTraceObserver.createStackTrace; stack trace recorded", trace);

        context.errorStackTrace = trace;
        this.clearState(context);
    },

    onExceptionUnwind: function(context, frame, value)
    {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=974254
        if (frame.script && frame.script.url === "self-hosted")
            return;

        var frameName = frame.callee && frame.callee.displayName;
        Trace.sysout("errorStackTraceObserver.onExceptionUnwind " + frameName, arguments);

        // If the previous unwind frame didn't have this frame as its parent frame,
        // it represents another exception which was swallowed by the page, or a
        // cleared state. Reset the exception stack state.
        if (context.errorStackTraceState.olderFrame !== frame)
            this.clearState(context);

        var state = context.errorStackTraceState;
        state.olderFrame = frame.older;

        // This will leak memory until/unless the error gets caught in console/errors.js,
        // or another exception is thrown.
        state.scripts.push(frame.script);
        state.offsets.push(frame.offset);
        state.frameNames.push(frameName);

        // Clone arguments eagerly because the frame's environment will die after we leave it.
        var argCopy = copyArguments(frame);
        state.argCopies.push(argCopy);

        if (state.olderFrame === null)
            this.createStackTrace(context);
    },
});

// ********************************************************************************************* //
// Local Helpers

function copyArguments(frame)
{
    var env = frame.environment;
    if (!env || !env.callee)
        return [];

    var callee = env.callee;
    var args = [];
    for (var name of callee.parameterNames)
    {
        var value = DebuggerLib.unwrapDebuggeeValue(env.getVariable(name));
        args.push({
            name: name,
            value: value
        });
    }

    return args;
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ErrorStackTraceObserver);

return ErrorStackTraceObserver;

// ********************************************************************************************* //
});
