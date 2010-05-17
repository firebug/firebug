/* See license.txt for terms of usage */
function _FirebugConsole()
{
    this.log = function log() { window._firebug.notifyFirebug(arguments, 'log', 'firebugAppendConsole'); }
    this.debug = function debug() { window._firebug.notifyFirebug(arguments, 'debug', 'firebugAppendConsole'); }
    this.info = function info() { window._firebug.notifyFirebug(arguments, 'info', 'firebugAppendConsole'); }
    this.warn = function warn() { window._firebug.notifyFirebug(arguments, 'warn', 'firebugAppendConsole'); }
    this.exception = function exception() { window._firebug.notifyFirebug(arguments, 'exception', 'firebugAppendConsole'); }
    this.assert = function assert() { window._firebug.notifyFirebug(arguments, 'assert', 'firebugAppendConsole'); }
    this.dir = function dir() { window._firebug.notifyFirebug(arguments, 'dir', 'firebugAppendConsole'); }
    this.dirxml = function dirxml() { window._firebug.notifyFirebug(arguments, 'dirxml', 'firebugAppendConsole'); }
    this.trace = function firebugDebuggerTracer() { debugger; }
    this.group = function group() { window._firebug.notifyFirebug(arguments, 'group', 'firebugAppendConsole'); }
    this.groupEnd = function groupEnd() { window._firebug.notifyFirebug(arguments, 'groupEnd', 'firebugAppendConsole'); }
    this.groupCollapsed = function groupCollapsed() { window._firebug.notifyFirebug(arguments, 'groupCollapsed', 'firebugAppendConsole'); }
    this.time = function time() { window._firebug.notifyFirebug(arguments, 'time', 'firebugAppendConsole'); }
    this.timeEnd = function timeEnd() { window._firebug.notifyFirebug(arguments, 'timeEnd', 'firebugAppendConsole'); }
    this.profile = function profile() { window._firebug.notifyFirebug(arguments, 'profile', 'firebugAppendConsole'); }
    this.profileEnd = function profileEnd() { window._firebug.notifyFirebug(arguments, 'profileEnd', 'firebugAppendConsole'); }
    this.count = function count() { window._firebug.notifyFirebug(arguments, 'count', 'firebugAppendConsole'); }
    this.clear = function clear() { window._firebug.notifyFirebug(arguments, 'clear', 'firebugAppendConsole'); }
    this.table = function clear() { window._firebug.notifyFirebug(arguments, 'table', 'firebugAppendConsole'); }

    this.error = function error()
    {
        window.top._firebugStackTrace = "requested"; // flag to cause trace to store trace in context.stackTrace
        this.trace(); // set the context.stackTrace
        window._firebug.notifyFirebug(arguments, 'error', 'firebugAppendConsole');
        delete window.top._firebugStackTrace;
    }
    // DBG this.uid = Math.random();

    this.notifyFirebug = function notifyFirebug(objs, methodName, eventID)
    {
        var element = this.getFirebugElement();

        var event = document.createEvent("Events");
        event.initEvent(eventID, true, false);

        window._firebug.userObjects = [];
        for (var i=0; i<objs.length; i++)
            window._firebug.userObjects.push(objs[i]);

        var length = window._firebug.userObjects.length;
        element.setAttribute("methodName", methodName);

        // DBG element.setAttribute("uid", this.uid);

        // DBG if (length > 0)
        // DBG 	element.setAttribute("checkUserObjects", this.userObjects[0].toString());
        // DBG else
        // DBG 	element.setAttribute("checkUserObjects", "no userObjects");

        // DBG dump("FirebugConsole("+this.uid+") dispatching event "+methodName+" via "+eventID+" with "+length+ " user objects, [0]:"+this.userObjects[0]+"\n");
        //debugger;

        element.dispatchEvent(event);

        // DBG dump("FirebugConsole dispatched event "+methodName+" via "+eventID+" with "+length+ " user objects, [0]:"+this.userObjects[0]+"\n");

        var result;
        if (element.getAttribute("retValueType") == "array")
            result = [];

        if (!result && this.userObjects.length == length+1)
            return this.userObjects[length];

        for (var i=length; i<this.userObjects.length && result; i++)
            result.push(this.userObjects[i]);

        return result;
    };

    this.getFirebugElement = function getFirebugElement()
    {
        if (!this.element)
            this.element = window._getFirebugConsoleElement();
        return this.element;
    },

    // ***********************************************************************
    // Console API

    this.__defineGetter__("firebug", function firebug() {
        return this.getFirebugElement().getAttribute("FirebugVersion");
    });
}

window._getFirebugConsoleElement = function _getFirebugConsoleElement()
{
    var element = document.body ? document.body : document.getElementsByTagName("body")[0];
    if (!element)
        element = document.documentElement;  // For non-HTML docs
    return element;
};
