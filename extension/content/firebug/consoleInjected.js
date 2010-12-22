/* See license.txt for terms of usage */
function _createFirebugConsole()
{
    var console = {};
    console.log = function log() { console.notifyFirebug(arguments, 'log', 'firebugAppendConsole'); }
    console.debug = function debug() { console.notifyFirebug(arguments, 'debug', 'firebugAppendConsole'); }
    console.info = function info() { console.notifyFirebug(arguments, 'info', 'firebugAppendConsole'); }
    console.warn = function warn() { console.notifyFirebug(arguments, 'warn', 'firebugAppendConsole'); }
    console.exception = function exception() { console.notifyFirebug(arguments, 'exception', 'firebugAppendConsole'); }
    console.assert = function assert() { console.notifyFirebug(arguments, 'assert', 'firebugAppendConsole'); }
    console.dir = function dir() { console.notifyFirebug(arguments, 'dir', 'firebugAppendConsole'); }
    console.dirxml = function dirxml() { console.notifyFirebug(arguments, 'dirxml', 'firebugAppendConsole'); }
    console.trace = function firebugDebuggerTracer() { debugger; }
    console.group = function group() { console.notifyFirebug(arguments, 'group', 'firebugAppendConsole'); }
    console.groupEnd = function groupEnd() { console.notifyFirebug(arguments, 'groupEnd', 'firebugAppendConsole'); }
    console.groupCollapsed = function groupCollapsed() { console.notifyFirebug(arguments, 'groupCollapsed', 'firebugAppendConsole'); }
    console.time = function time() { console.notifyFirebug(arguments, 'time', 'firebugAppendConsole'); }
    console.timeEnd = function timeEnd() { console.notifyFirebug(arguments, 'timeEnd', 'firebugAppendConsole'); }
    console.profile = function profile() { console.notifyFirebug(arguments, 'profile', 'firebugAppendConsole'); }
    console.profileEnd = function profileEnd() { console.notifyFirebug(arguments, 'profileEnd', 'firebugAppendConsole'); }
    console.count = function count() { console.notifyFirebug(arguments, 'count', 'firebugAppendConsole'); }
    console.clear = function clear() { console.notifyFirebug(arguments, 'clear', 'firebugAppendConsole'); }
    console.table = function table() { console.notifyFirebug(arguments, 'table', 'firebugAppendConsole'); }

    console.error = function error()
    {
        console.top._firebugStackTrace = "requested"; // flag to cause trace to store trace in context.stackTrace
        console.trace(); // set the context.stackTrace
        console.notifyFirebug(arguments, 'error', 'firebugAppendConsole');
        delete console.top._firebugStackTrace;
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


