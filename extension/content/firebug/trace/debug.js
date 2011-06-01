/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Debug APIs

const Cc = Components.classes;
const Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci["nsIConsoleService"]);

var Debug = {};

//************************************************************************************************
// Debug Logging

Debug.ERROR = function(exc)
{
    if (typeof(FBTrace) !== undefined)
    {
        if (exc.stack)
            exc.stack = exc.stack.split('\n');

        FBTrace.sysout("Debug.ERROR: " + exc, exc);
    }

    if (consoleService)
        consoleService.logStringMessage("FIREBUG ERROR: " + exc);
}

// ********************************************************************************************* //

return Debug;

// ********************************************************************************************* //
});
