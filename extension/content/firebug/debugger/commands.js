/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, unused:false, moz:true*/
/*global define:1, Components:true, Firebug:true*/

define([
    "firebug/lib/trace",
    "firebug/debugger/rdp",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointStore"
],
function(FBTrace, RDP, DebuggerLib, BreakpointStore) {

"use strict";

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm");

var Trace = FBTrace.to("DBG_DEBUGGER_COMMANDS");
var TraceError = FBTrace.toError();

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
        var threadActor = DebuggerLib.getThreadActor(context.browser);
        if (!threadActor)
            return "No threadActor?";

        var pool = threadActor.threadLifetimePool;
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
        var threadActor = DebuggerLib.getThreadActor(context.browser);
        if (!threadActor)
            return "No threadActor?";

        var pool = threadActor._pausePool;
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
        var threadActor = DebuggerLib.getThreadActor(context.browser);
        if (!threadActor)
            return "No threadActor?";

        // Log breakpoints on the server side.
        var actors = threadActor.breakpointStore._wholeLineBreakpoints;
        var size = threadActor.breakpointStore.size;

        Firebug.Console.logFormatted(["Server actors %d %o ", size, actors], context, "info");

        Trace.sysout("Server breakpoint store", threadActor.breakpointStore);

        // xxxHonza: Clone all breakpoints before logging. There is an exception
        // when the DOM panel (used after clicking on the logged object)
        // is trying to display instances of {@link Breakpoint} using
        // {@link BreakpointRep}
        var result = {};
        BreakpointStore.enumerateBreakpoints(null, true, function(bp)
        {
            var newBp = {};
            for (var p in bp)
                newBp[p] = bp[p];

            if (!result[bp.href])
                result[bp.href] = [];

            result[bp.href].push(newBp);
        });

        // Log Firebug breakpoint objects.
        Firebug.Console.logFormatted(["Breakpoint Store %o", result], context, "info");

        // Log breakpoint clients objects
        Firebug.Console.logFormatted(["Breakpoint Clients %o", context.breakpointClients],
            context, "info");
    }
    catch (e)
    {
        TraceError.sysout("commands.threadBreakpoints; EXCEPTION " + e, e);
    }

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //

function getSource(context, args)
{
    try
    {
        if (!context.activeThread)
            return "No active thread";

        var actor = args[0];
        if (!actor)
        {
            context.activeThread.getSources(function(response)
            {
                FBTrace.sysout("commands.getSource(s):", response);

                if (response.error)
                    return Firebug.Console.log(response.error);

                return Firebug.Console.log(response.sources);
            });
        }
        else
        {
            var sourceClient = context.activeThread.source({actor: actor});
            sourceClient.source(function(response)
            {
                FBTrace.sysout("commands.getSource:", response);

                if (response.error)
                    return Firebug.Console.log(response.error);

                return Firebug.Console.log(response.source);
            });
        }
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
});

Firebug.registerCommand("tabGrip", {
    handler: tabGrip.bind(this),
    description: "Helper command for accessing server side tab child Grips. For debugging purposes only."
});

Firebug.registerCommand("threadPool", {
    handler: threadPool.bind(this),
    description: "Helper command for accessing server side thread pool. For debugging purposes only."
});

Firebug.registerCommand("pausePool", {
    handler: pausePool.bind(this),
    description: "Helper command for accessing server side pause pool. For debugging purposes only."
});

Firebug.registerCommand("breakpoints", {
    handler: threadBreakpoints.bind(this),
    description: "Helper command for accessing breakpoints on the server side. For debugging purposes only."
});

Firebug.registerCommand("getSource", {
    handler: getSource.bind(this),
    description: "Helper command for getting source from the server side. For debugging purposes only."
});

return {};

// ********************************************************************************************* //
});
