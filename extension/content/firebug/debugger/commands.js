/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/rdp",
],
function(FBTrace, RDP) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm");

var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Command Implementation

function pauseGrip(context, args)
{
    var actor = args[0];
    var type = args[1];

    var thread = context.activeThread;
    if (!thread)
        return "The debugger must be attached to a thread";

    if (!actor)
        return "No actor specified";

    var packet = {
        to: actor,
        type: type || RDP.DebugProtocolTypes.prototypeAndProperties
    };

    context.clientCache.request(packet).then(function(response)
    {
        Firebug.Console.log(response);
    });

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //

function tabGrip(context, args)
{
    var actor = args[0];
    var type = args[1];

    if (!actor)
        return "No actor specified";

    if (!type)
        return "No type specified";

    var packet = {
        to: actor,
        type: type
    };

    Firebug.debuggerClient.request(packet, function(response)
    {
        Firebug.Console.log(response);
    });

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //

function threadPool(context, args)
{
    try
    {
        var conn = DebuggerServer._connections["conn0."];
        var tabActor = conn.rootActor._tabActors.get(context.browser);
        var pool = tabActor.threadActor.threadLifetimePool;
        Firebug.Console.log(pool);
    }
    catch (e)
    {
        TraceError.sysout("commands.threadPool; EXCEPTION " + e, e);
    }

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //

function pausePool(context, args)
{
    try
    {
        var conn = DebuggerServer._connections["conn0."];
        var tabActor = conn.rootActor._tabActors.get(context.browser);
        var pool = tabActor.threadActor._pausePool;
        Firebug.Console.log(pool);
    }
    catch (e)
    {
        TraceError.sysout("commands.threadPool; EXCEPTION " + e, e);
    }

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //

function threadBreakpoints(context, args)
{
    try
    {
        var conn = DebuggerServer._connections["conn0."];
        var tabActor = conn.rootActor._tabActors.get(context.browser);
        var store = tabActor.threadActor._breakpointStore;
        Firebug.Console.log(store);
        FBTrace.sysout("Breakpoint Store:", store);
    }
    catch (e)
    {
        TraceError.sysout("commands.threadBreakpoints; EXCEPTION " + e, e);
    }

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("pauseGrip", {
    handler: pauseGrip.bind(this),
    description: "Helper command for accessing server side Grips. For debugging purposes only."
})

Firebug.registerCommand("tabGrip", {
    handler: tabGrip.bind(this),
    description: "Helper command for accessing server side tab child Grips. For debugging purposes only."
})

Firebug.registerCommand("threadPool", {
    handler: threadPool.bind(this),
    description: "Helper command for accessing server side thread pool. For debugging purposes only."
})

Firebug.registerCommand("pausePool", {
    handler: pausePool.bind(this),
    description: "Helper command for accessing server side pause pool. For debugging purposes only."
})

Firebug.registerCommand("threadBreakpoints", {
    handler: threadBreakpoints.bind(this),
    description: "Helper command for accessing breakpoints on the server side. For debugging purposes only."
})

return {};

// ********************************************************************************************* //
});
