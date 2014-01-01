/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
],
function(Firebug, Obj, FBTrace, Options, DebuggerLib, StackFrame, StackTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_ERRORLOG");

// ********************************************************************************************* //
// ErrorStackTraceObserver Module

/**
 * @module Uses JSD2 Debugger to observe errors and store stack traces for them.
 * The final stack trace info is stored into Firebug.errorStackTrace variable.
 * (just like JSD1 did).
 *
 * Since onFrameEnter/onFramePop are handled observing can causes performance penalty.
 */
var ErrorStackTraceObserver = Obj.extend(Firebug.Module,
/** @lends ErrorStackTraceObserver */
{
    dispatchName: "ErrorStackTraceObserver",

    scripts: [],
    offsets: [],
    frameNames: [],
    argCopies: [],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initContext: function(context)
    {
        Firebug.Module.initContext.apply(this, arguments);

        var enabled = Options.get("showStackTrace");
        if (enabled)
            this.startObserving(context);
    },

    destroyContext: function(context)
    {
        Firebug.Module.destroyContext.apply(this, arguments);

        this.stopObserving(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        // xxxHonza: we shouldn't use global Firebug.currentContext
        if (!Firebug.currentContext)
            return;

        if (name == "showStackTrace")
        {
            if (value)
                this.startObserving(Firebug.currentContext);
            else
                this.stopObserving(Firebug.currentContext);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // JSD2

    startObserving: function(context)
    {
        Trace.sysout("errorStackTraceObserver.startObserving; " + context.getName());

        if (context.errorStackTraceDbg)
        {
            TraceError.sysout("errorStackTraceObserver.startObserving; " +
                "stack trace debugger already exists!");
            return;
        }

        var dbg = DebuggerLib.makeDebuggerForContext(context);
        context.errorStackTraceDbg = dbg;

        dbg.onEnterFrame = this.onEnterFrame.bind(this, context);

        // xxxHonza: perhaps the entire logic could be based on 'onExceptionUnwind' handler?
        /*dbg.onExceptionUnwind = function(frame, value)
        {
            Trace.sysout("errorStackTraceObserver.onExceptionUnwind ", arguments);
        };*/

        // xxxHonza: mentioned in the docs, but not working yet.
        // https://wiki.mozilla.org/Debugger
        /*dbg.uncaughtExceptionHook = function(e)
        {
            Trace.sysout("errorStackTraceObserver.uncaughtExceptionHook " + e, e);
        };*/

        // Mentioned in docs but unimplemented.
        /*dbg.onError = function(frame, report)
        {
            Trace.sysout("errorStackTraceObserver.onError ", arguments);
        };

        dbg.onThrow = function(frame, value)
        {
            Trace.sysout("errorStackTraceObserver.onThrow ", arguments);
        };*/
    },

    stopObserving: function(context)
    {
        Trace.sysout("errorStackTraceObserver.stopObserving; " + context.getName());

        if (!context.errorStackTraceDbg)
            return;

        try
        {
            DebuggerLib.destroyDebuggerForContext(context, context.errorStackTraceDbg);
            context.errorStackTraceDbg = null;
        }
        catch (err)
        {
            TraceError.sysout("errorStackTraceObserver.stopObserving; EXCEPTION " + err, err);
        }

        delete context.errorStackTraceDbg;
    },

    onEnterFrame: function(context, frame)
    {
        frame.onPop = this.onPopFrame.bind(this, context, frame);
    },

    onPopFrame: function(context, frame, completionValue)
    {
        if (!("throw" in completionValue))
            return;

        // xxxHonza: is it memory-leak safe?
        this.scripts.push(frame.script);
        this.offsets.push(frame.offset);
        this.frameNames.push(StackFrame.getFunctionName(frame));

        var argCopy = copyArguments(frame);
        this.argCopies.push(argCopy);

        if (frame.older !== null)
            return;

        var trace = new StackTrace();

        var self = this;
        this.scripts.forEach(function(script, i)
        {
            var script = self.scripts[i];
            var sourceFile = context.sourceFileMap[script.url];
            if (!sourceFile)
                sourceFile = {href: frame.script.url};

            var line = script.getOffsetLine(self.offsets[i]);
            var args = self.argCopies[i];

            var stackFrame = new StackFrame(sourceFile, line, self.frameNames[i],
                args, null, 0, context);
            trace.frames.push(stackFrame);
        });

        Trace.sysout("errorStackTraceObserver.onPopFrame; Error stack trace recorded", trace);

        // The trace will be consumed by {@Errors.logScriptError}.
        // xxxHonza: the stack should be accessed by the {@Errors} object through
        // a simple API here in {@ErrorStackTraceObserver}.
        Firebug.errorStackTrace = trace;

        this.scripts = [];
        this.offsets = [];
        this.frameNames = [];
        this.argCopies = [];
    },
});

// ********************************************************************************************* //
// Local Helpers

function copyArguments(frame)
{
    var env = frame.environment;

    // xxxHonza: this part should be removed in favor of the commented-out part
    // below when getVariableDescriptor lands (bug 725815).
    // See also dbg-script-actors.js EnvironmentActor._bindings()
    if (typeof env.getVariable != "function")
        return [];

    var callee = env.callee;
    if (!callee)
        return [];

    var args = [];
    for (var p in callee.parameterNames)
    {
        var name = callee.parameterNames[p];
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
