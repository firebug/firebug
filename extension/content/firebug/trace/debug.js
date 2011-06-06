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

/**
 * Dump the current stack trace.
 * @param {Object} message displayed for the log.
 */
Debug.STACK_TRACE = function(message)
{
    var result = [];
    for (var frame = Components.stack, i = 0; frame; frame = frame.caller, i++)
    {
        if (i < 1)
            continue;

        var fileName = unescape(frame.filename ? frame.filename : "");
        var lineNumber = frame.lineNumber ? frame.lineNumber : "";

        result.push(fileName + ":" + lineNumber);
    }
    FBTrace.sysout(message, result);
}

return Debug;

// ********************************************************************************************* //
});
