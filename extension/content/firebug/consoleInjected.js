/* See license.txt for terms of usage */
function _FirebugConsole()
{
    this.log = function() { this.notifyFirebug(arguments, 'log', 'firebugAppendConsole'); }
    this.debug = function() { this.notifyFirebug(arguments, 'debug', 'firebugAppendConsole'); }
    this.info = function() { this.notifyFirebug(arguments, 'info', 'firebugAppendConsole'); }
    this.warn = function() { this.notifyFirebug(arguments, 'warn', 'firebugAppendConsole'); }
    this.error = function() { this.notifyFirebug(arguments, 'error', 'firebugAppendConsole'); }
    this.assert = function() { this.notifyFirebug(arguments, 'assert', 'firebugAppendConsole'); }
    this.dir = function() { this.notifyFirebug(arguments, 'dir', 'firebugAppendConsole'); }
    this.dirxml = function() { this.notifyFirebug(arguments, 'dirxml', 'firebugAppendConsole'); }
    this.trace = function() { this.notifyFirebug(arguments, 'trace', 'firebugAppendConsole'); }
    this.group = function() { this.notifyFirebug(arguments, 'group', 'firebugAppendConsole'); }
    this.groupEnd = function() { this.notifyFirebug(arguments, 'groupEnd', 'firebugAppendConsole'); }
    this.groupCollapsed = function() { this.notifyFirebug(arguments, 'groupCollapsed', 'firebugAppendConsole'); }
    this.time = function() { this.notifyFirebug(arguments, 'time', 'firebugAppendConsole'); }
    this.timeEnd = function() { this.notifyFirebug(arguments, 'timeEnd', 'firebugAppendConsole'); }
    this.profile = function() { this.notifyFirebug(arguments, 'profile', 'firebugAppendConsole'); }
    this.profileEnd = function() { this.notifyFirebug(arguments, 'profileEnd', 'firebugAppendConsole'); }
    this.count = function() { this.notifyFirebug(arguments, 'count', 'firebugAppendConsole'); }
    this.clear = function() { this.notifyFirebug(arguments, 'clear', 'firebugAppendConsole'); }

    this.notifyFirebug = function(objs, methodName, eventID)
    {
        var element = this.getFirebugElement();

        var event = document.createEvent("Events");
        event.initEvent(eventID, true, false);

        this.userObjects = [];
        for (var i=0; i<objs.length; i++)
            this.userObjects.push(objs[i]);

        var length = this.userObjects.length;
        element.setAttribute("methodName", methodName);
        element.dispatchEvent(event);

        //dump("FirebugConsole dispatched event "+methodName+" via "+eventID+"\n");
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
        element = document.createElementNS("http://www.w3.org/1999/xhtml","html:div"); // NS for XML/svg
        element.setAttribute("id", "_firebugConsole");
        element.firebugIgnore = true;
         
        element.setAttribute("style", "display:none");

        document.documentElement.appendChild(element);
    }
    return element;
};
 