/* See license.txt for terms of usage */
function _FirebugConsole()
{
    this.log = function() { window._firebug.notifyFirebug(arguments, 'log', 'firebugAppendConsole'); }
    this.debug = function() { window._firebug.notifyFirebug(arguments, 'debug', 'firebugAppendConsole'); }
    this.info = function() { window._firebug.notifyFirebug(arguments, 'info', 'firebugAppendConsole'); }
    this.warn = function() { window._firebug.notifyFirebug(arguments, 'warn', 'firebugAppendConsole'); }
    this.error = function() { window._firebug.notifyFirebug(arguments, 'error', 'firebugAppendConsole'); }
    this.exception = function() { window._firebug.notifyFirebug(arguments, 'exception', 'firebugAppendConsole'); }
    this.assert = function() { window._firebug.notifyFirebug(arguments, 'assert', 'firebugAppendConsole'); }
    this.dir = function() { window._firebug.notifyFirebug(arguments, 'dir', 'firebugAppendConsole'); }
    this.dirxml = function() { window._firebug.notifyFirebug(arguments, 'dirxml', 'firebugAppendConsole'); }
    this.trace = function firebugDebuggerTracer() { debugger; }
    this.group = function() { window._firebug.notifyFirebug(arguments, 'group', 'firebugAppendConsole'); }
    this.groupEnd = function() { window._firebug.notifyFirebug(arguments, 'groupEnd', 'firebugAppendConsole'); }
    this.groupCollapsed = function() { window._firebug.notifyFirebug(arguments, 'groupCollapsed', 'firebugAppendConsole'); }
    this.time = function() { window._firebug.notifyFirebug(arguments, 'time', 'firebugAppendConsole'); }
    this.timeEnd = function() { window._firebug.notifyFirebug(arguments, 'timeEnd', 'firebugAppendConsole'); }
    this.profile = function() { window._firebug.notifyFirebug(arguments, 'profile', 'firebugAppendConsole'); }
    this.profileEnd = function() { window._firebug.notifyFirebug(arguments, 'profileEnd', 'firebugAppendConsole'); }
    this.count = function() { window._firebug.notifyFirebug(arguments, 'count', 'firebugAppendConsole'); }
    this.clear = function() { window._firebug.notifyFirebug(arguments, 'clear', 'firebugAppendConsole'); }

    // DBG this.uid = Math.random();

    this.notifyFirebug = function(objs, methodName, eventID)
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

    this.getFirebugElement = function()
    {
        if (!this.element)
            this.element = window._getFirebugConsoleElement();
        return this.element;
    },

    // ***********************************************************************
    // Console API

    this.__defineGetter__("firebug", function(){
        return this.getFirebugElement().getAttribute("FirebugVersion");
    });
}

window._getFirebugConsoleElement = function()  // could this be done in extension code? but only after load....
{
    var element = document.getElementById("_firebugConsole");
    if (!element)
    {
        if (document.documentElement.nodeName == document.documentElement.nodeName.toUpperCase())
            element = document.createElement("div");
        else
            element = document.createElementNS("http://www.w3.org/1999/xhtml","html:div"); // NS for XML/svg

        element.setAttribute("id", "_firebugConsole");
        element.firebugIgnore = true;
        element.setAttribute("style", "display:none");

        var body = document.body ? document.body : document.getElementsByTagName("body")[0];
        if (!body)
            body = document.documentElement;  // For non-HTML docs

        body.appendChild(element);
    }
    return element;
};
