/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

function pauseGrip(context, args)
{
    var actor = args[0];
    var type = args[1];

    var context = Firebug.currentContext;
    if (!context)
        return "No current context";

    var client = context.debuggerClient;
    if (!client)
        return "Debugger client not available";

    var thread = client.activeThread;
    if (!thread)
        return "The debugger must be paused";

    if (!actor)
        return "No actor specified";

    var grip = thread.pauseGrip({actor: actor});
    grip.getPrototypeAndProperties(function(response)
    {
        Firebug.Console.log(response);
    });

    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("pauseGrip", {
    handler: pauseGrip.bind(this),
    description: "Helper command for accessing server side Grips. For debugging purposes only."
})

return {};

// ********************************************************************************************* //
});
