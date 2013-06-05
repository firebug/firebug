/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/url",
    "firebug/lib/string",
],
function(FBTrace, Url, Str) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var Trace = FBTrace.to("DBG_PROFILER");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Profiler engine based on JSD2 API

/**
 * Instance of {@ProfilerEngine} is always associated with a context (content window)
 */
function ProfilerEngine(context)
{
    this.context = context
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
        this.scripts = new Map();

        // Total profiling time (total executing time of the first executed frame).
        this.startTime = null;
        this.endTime = null;

        // Get debugger for profiled global (the current content window).
        this.dbg = this.getDebugger(this.context);

        // Hook function calls
        this.dbg.onEnterFrame = this.onEnterFrame.bind(this);
    },

    stopProfiling: function()
    {
        // Remove debugger hook.
        this.dbg.onEnterFrame = undefined;

        Trace.sysout("profilerEngine.stopProfiling;", this.scripts);

        // Return total execution time.
        return this.endTime - this.startTime;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // xxxHonza: firebug/debugger/debuggerLib module should be used somehow
    getDebugger: function(context)
    {
        var jsDebugger = {};
        Cu.import("resource://gre/modules/jsdebugger.jsm", jsDebugger);

        var global = Cu.getGlobalForObject({});
        jsDebugger.addDebuggerToGlobal(global);

        // xxxHonza: all iframes should be supported.
        return new global.Debugger(context.window);
    },

    enumerateScripts: function(callback)
    {
        var keys = this.scripts.keys();
        for (var key of keys)
        {
            var script = this.scripts.get(key);

            // Compute own execution time (total nested execution time from nested frames
            // has been collected during the profiling session).
            script.totalOwnExecutionTime = script.totalExecutionTime -
                script.totalNestedExecutionTime;

            callback.enumerateScript(script);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Handlers

    // xxxHonza: try-catch could slow down the profiling, it should be removed eventually.
    onEnterFrame: function(frame)
    {
        try
        {
            this.doEnterFrame(frame);
        }
        catch (e)
        {
            TraceError.sysout("profilerEngine.onEnterFrame; EXCEPTION", e);
        }
    },

    onPopFrame: function(frame, startTime, scriptInfo, completionValue)
    {
        try
        {
            this.doPopFrame(frame, startTime, scriptInfo, completionValue);
        }
        catch (e)
        {
            TraceError.sysout("profilerEngine.onPopFrame; EXCEPTION", e);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    doEnterFrame: function(frame)
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

        var scriptInfo = this.scripts.get(script);
        if (!scriptInfo)
        {
            var url = script.url;
            var name = frame.callee ? frame.callee.name : "anonymous";

            scriptInfo = {
                callCount: 0,
                startLine: script.startLine,
                url: url,
                fileName: Url.getFileName(url),
                funcName: name,
                totalExecutionTime: 0,
                minExecutionTime: Infinity,
                maxExecutionTime: -Infinity,
                totalNestedExecutionTime: 0,
            };

            this.scripts.set(script, scriptInfo);
        }

        scriptInfo.callCount++;

        // Hook 'onPop' so we can also get the end execution time.
        frame.onPop = this.onPopFrame.bind(this, frame, now, scriptInfo);
    },

    doPopFrame: function(frame, startTime, scriptInfo, completionValue)
    {
        this.endTime = this.now();

        // Compute total execution time for the script (frame).
        var elapsedTime = this.endTime - startTime;
        scriptInfo.totalExecutionTime += elapsedTime;

        if (!frame.live)
        {
            TraceError.sysout("profilerEngine.onPopFrame; ERROR frame not live!");
            return;
        }

        // Update min execution time
        if (elapsedTime < scriptInfo.minExecutionTime)
            scriptInfo.minExecutionTime = elapsedTime;

        // Update max execution time
        if (elapsedTime > scriptInfo.maxExecutionTime)
            scriptInfo.maxExecutionTime = elapsedTime;

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

        var olderScriptInfo = this.scripts.get(olderScript);
        if (!olderScriptInfo)
        {
            TraceError.sysout("profilerEngine.onPopFrame; ERROR unknown older script!");
            return;
        }

        // Sum up nested (child) execution time.
        // xxxHonza: the results can be a bit confusing in case of recursion.
        olderScriptInfo.totalNestedExecutionTime += elapsedTime;
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
// Registration

return ProfilerEngine;

// ********************************************************************************************* //
});
