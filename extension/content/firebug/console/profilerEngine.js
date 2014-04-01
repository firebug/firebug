/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, evil:true, forin:false*/
/*global define:true */

define([
    "firebug/lib/trace",
    "firebug/debugger/debuggerLib",
],
function(FBTrace, DebuggerLib) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_PROFILER");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Profiler engine based on JSD2 API

/**
 * Instance of {@ProfilerEngine} is always associated with a context (content window)
 */
function ProfilerEngine(context)
{
    this.context = context;
}

/**
 * @object Implements logic for collecting data about script execution. The object
 * collects the following information:
 * 1) Function call count
 * 2) Execution time (including and not including nested calls)
 * 3) Total execution time
 */
ProfilerEngine.prototype =
/** @lends ProfilerEngine */
{
    startProfiling: function()
    {
        // Collected profiling results are stored per 'script'.
        this.scripts = [];

        // Total profiling time (total executing time of the first executed frame).
        this.startTime = null;
        this.endTime = null;

        // Get a debugger for the current context (top level window and all iframes).
        this.dbg = DebuggerLib.makeDebuggerForContext(this.context);

        // Hook function calls.
        this.dbg.onEnterFrame = this.onEnterFrame.bind(this);
    },

    stopProfiling: function()
    {
        DebuggerLib.destroyDebuggerForContext(this.context, this.dbg);
        this.dbg = null;

        Trace.sysout("profilerEngine.stopProfiling;", this.scripts);

        // Return total execution time.
        return this.endTime - this.startTime;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    enumerateScripts: function(callback)
    {
        for (var i=0; i<this.scripts.length; i++)
        {
            var script = this.scripts[i];

            // Compute own execution time (total nested execution time from nested frames
            // has been collected during the profiling session).
            script.totalOwnExecutionTime = script.totalExecutionTime -
                script.totalNestedExecutionTime;

            callback.enumerateScript(script);

            // Just in case we'd like to reuse the same instance
            // of the Debugger object in another profiling session.
            script.initialized = false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Handlers

    onEnterFrame: function(frame)
    {
        var now = this.now();

        // Remember the first start time to compute the total profiling time later.
        if (!this.startTime)
            this.startTime = now;

        if (!frame.live)
        {
            TraceError.sysout("profilerEngine.onEnterFrame; ERROR frame not live!");
            return;
        }

        // Collected data are sorted per script, see the scriptInfo below.
        // There is one info structure per script object.
        var script = frame.script;
        if (!script)
        {
            TraceError.sysout("profilerEngine.onEnterFrame; ERROR null script!");
            return;
        }

        if (!script.initialized)
        {
            script.initialized = true;

            if (!script.funcName && frame.callee)
                script.funcName = getFunctionDisplayName(frame.callee);

            if (typeof(script.callCount) == "undefined")
                script.callCount = 0;

            script.minExecutionTime = Infinity;
            script.maxExecutionTime = -Infinity;
            script.totalNestedExecutionTime = 0;
            script.totalExecutionTime = 0;

            this.scripts.push(script);
        }

        script.callCount++;

        // Hook 'onPop' so we can also get the end execution time.
        frame.onPop = this.onPopFrame.bind(this, frame, now, script);
    },

    onPopFrame: function(frame, startTime, script, completionValue)
    {
        this.endTime = this.now();

        // Compute total execution time for the script (frame).
        var elapsedTime = this.endTime - startTime;
        script.totalExecutionTime += elapsedTime;

        if (!frame.live)
        {
            TraceError.sysout("profilerEngine.onPopFrame; ERROR frame not live!");
            return;
        }

        // Update min execution time
        if (elapsedTime < script.minExecutionTime)
            script.minExecutionTime = elapsedTime;

        // Update max execution time
        if (elapsedTime > script.maxExecutionTime)
            script.maxExecutionTime = elapsedTime;

        // Computing own-execution-time is a little more trickier.
        // 1) Younger frames are putting theirs total execution time to parent frames, where the
        // sum is computed. Consequently, the own execution time is computed as follows:
        // own-execution-time = total-execution-time - nested-execution-time;
        // 2) Frames with no nested calls will have: nested-execution-time == 0 and so,
        // own-execution-time == total-execution-time
        // 3) The own-execution-time computation is done in the end of the profiling session
        // when the consumer enumerates result scripts. See {@ProfilerEngine.enumerateScripts}.
        var olderScript = frame.older ? frame.older.script : null;
        if (!olderScript)
            return;

        // Sum up nested (child) execution time.
        // xxxHonza: the results can be a bit confusing in case of recursion.
        olderScript.totalNestedExecutionTime += elapsedTime;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    now: function()
    {
        // Use performance.now() it's slower, but more precise
        // Don't forget that performance.now() is relative to navigationStart.
        var win = this.context.window;

        // Does using chrome's performance.now() make any difference?
        var now = win.performance.now();
        return win.performance.timing.navigationStart + now;
    },
};

// ********************************************************************************************* //
// Helpers

function getFunctionDisplayName(callee)
{

    try
    {
        var displayNameDescriptor = callee.getOwnPropertyDescriptor("displayName");

        var isValidDisplayName = displayNameDescriptor &&
            typeof displayNameDescriptor.value === "string" &&
            displayNameDescriptor.value;

        if (isValidDisplayName)
            return displayNameDescriptor.value;
    }
    catch (ex)
    {
        // Calling getOwnPropertyDescriptor with displayName might throw
        // with "permission denied" errors for some functions.
        Trace.sysout("ProfilerEngine.onEnterFrame; getting displayNameDescriptor " +
            "threw an exception.", ex);
    }

    return callee.displayName;
}

// ********************************************************************************************* //
// Registration

return ProfilerEngine;

// ********************************************************************************************* //
});
