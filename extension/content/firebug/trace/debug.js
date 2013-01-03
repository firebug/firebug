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
var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci["nsIObserverService"]);

var Debug = {};

//************************************************************************************************
// Debug Logging

Debug.ERROR = function(exc)
{
    if (typeof(FBTrace) !== undefined)
    {
        if (exc.stack)
            exc.stack = exc.stack.split('\n');

        FBTrace.sysout("debug.ERROR: " + exc, exc);
    }

    if (consoleService)
        consoleService.logStringMessage("FIREBUG ERROR: " + exc);
};

// ********************************************************************************************* //
// Tracing for observer service

Debug.traceObservers = function(msg, topic)
{
    var counter = 0;
    var enumerator = observerService.enumerateObservers(topic);
    while (enumerator.hasMoreElements())
    {
        var observer = enumerator.getNext();
        counter++;
    }

    var label = "observer";
    if (counter > 1)
        label = "observers";

    FBTrace.sysout("debug.observers: " + msg + " There is " + counter + " " +
        label + " for " + topic);
};

// ********************************************************************************************* //

return Debug;

// ********************************************************************************************* //
});
