/* See license.txt for terms of usage */

// ********************************************************************************************* //

function _createFirebugConsole()
{
    var console = {};
    console.log = function log() { return console.notifyFirebug(arguments, 'log', 'firebugAppendConsole'); }
    console.debug = function debug() { return console.notifyFirebug(arguments, 'debug', 'firebugAppendConsole'); }
    console.info = function info() { return console.notifyFirebug(arguments, 'info', 'firebugAppendConsole'); }
    console.warn = function warn() { return console.notifyFirebug(arguments, 'warn', 'firebugAppendConsole'); }
    console.exception = function exception() { return console.notifyFirebug(arguments, 'exception', 'firebugAppendConsole'); }
    console.assert = function assert() { return console.notifyFirebug(arguments, 'assert', 'firebugAppendConsole'); }
    console.dir = function dir() { return console.notifyFirebug(arguments, 'dir', 'firebugAppendConsole'); }
    console.dirxml = function dirxml() { return console.notifyFirebug(arguments, 'dirxml', 'firebugAppendConsole'); }
    console.trace = function firebugDebuggerTracer() { debugger; return "_firebugIgnore"; }
    console.group = function group() { return console.notifyFirebug(arguments, 'group', 'firebugAppendConsole'); }
    console.groupEnd = function groupEnd() { return console.notifyFirebug(arguments, 'groupEnd', 'firebugAppendConsole'); }
    console.groupCollapsed = function groupCollapsed() { return console.notifyFirebug(arguments, 'groupCollapsed', 'firebugAppendConsole'); }
    console.time = function time() { return console.notifyFirebug(arguments, 'time', 'firebugAppendConsole'); }
    console.timeEnd = function timeEnd() { return console.notifyFirebug(arguments, 'timeEnd', 'firebugAppendConsole'); }
    console.profile = function profile() { return console.notifyFirebug(arguments, 'profile', 'firebugAppendConsole'); }
    console.profileEnd = function profileEnd() { return console.notifyFirebug(arguments, 'profileEnd', 'firebugAppendConsole'); }
    console.count = function count() { return console.notifyFirebug(arguments, 'count', 'firebugAppendConsole'); }
    console.clear = function clear() { return console.notifyFirebug(arguments, 'clear', 'firebugAppendConsole'); }
    console.table = function table() { return console.notifyFirebug(arguments, 'table', 'firebugAppendConsole'); }

    console.error = function error()
    {
        window.top._firebugStackTrace = "requested"; // flag to cause trace to store trace in context.stackTrace
        console.trace(); // set the context.stackTrace
        var rc = console.notifyFirebug(arguments, 'error', 'firebugAppendConsole');
        delete window.top._firebugStackTrace;
        return rc;
    }
    // DBG console.uid = Math.random();

    console.notifyFirebug = function notifyFirebug(objs, methodName, eventID)
    {
        var event = document.createEvent("Events");
        event.initEvent(eventID, true, false);

        console.userObjects = [];
        for (var i=0; i<objs.length; i++)
            console.userObjects.push(objs[i]);

        var length = console.userObjects.length;
        document.setUserData("firebug-methodName", methodName, null);

        document.dispatchEvent(event);

        // DBG dump("FirebugConsole dispatched event "+methodName+" via "+eventID+" with "+length+ " user objects, [0]:"+console.userObjects[0]+"\n");

        var result;
        if (document.getUserData("firebug-retValueType") == "array")
            result = [];

        if (!result && console.userObjects.length == length+1)
            return console.userObjects[length];

        for (var i=length; i<console.userObjects.length && result; i++)
            result.push(console.userObjects[i]);

        return result;
    };

    // ***********************************************************************
    // Console API

    console.__defineGetter__("firebug", function firebug() {
        return document.getUserData("firebug-Version");
    });

    return console;
}

// ********************************************************************************************* //
