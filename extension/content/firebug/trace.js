/* See license.txt for terms of usage */

// Our global trace object.

Components.utils.import("resource://firebug/firebug-trace-service.js");
var FBTrace = traceConsoleService.getTracer("extensions.firebug");

FBTrace.setScope(window);
function clearFBTraceScope()
{
    window.removeEventListener('unload', clearFBTraceScope, true);
    FBTrace.setScope(null);
}
window.addEventListener('unload', clearFBTraceScope, true);

FBTrace.time = function(name, reset)
{
    if (!name)
        return "_firebugIgnore";

    var time = new Date().getTime();

    if (!FBTrace.timeCounters)
        FBTrace.timeCounters = {};

    var key = "KEY"+name.toString();

    if (!reset && FBTrace.timeCounters[key])
        return;

    this.timeCounters[key] = time;
    return "_firebugIgnore";
};

FBTrace.timeEnd = function(name)
{
    var time = new Date().getTime();

    if (!FBTrace.timeCounters)
        return "_firebugIgnore";

    var key = "KEY"+name.toString();

    var timeCounter = FBTrace.timeCounters[key];
    if (timeCounter)
    {
        var diff = time - timeCounter;
        var label = name + ": " + diff + "ms";

        FBTrace.sysout(label);

        delete this.timeCounters[key];
    }
    return diff;
};

FBTrace.time("INITIALIZATION_TIME");

// ************************************************************************************************
// Some examples of tracing APIs

// 1) Log "Hello World!" into the console.
//    FBTrace.sysout("Hello World!")
//
// 2) Log "Hello World!" if the DBG_ERRORS option is true.
//    if (FBTrace.DBG_ERRORS)
//       FBTrace.sysout("Hello World!");
//
// 3) Log "Hello World!" and various info about 'world' object.
//    FBTrace.sysout("Hello World!", world);
//
// 4) Log into specific console (created by Firebug extension).
//    FBTrace.dump("firebug.extensions", "Hello World!", world);
//    FBTrace.dump("chromebug.extensions", "Hello World!", world);
//
// TODO: how to open another console.