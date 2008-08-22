/* See license.txt for terms of usage */
function _FirebugConsole()
{
    this.init = function()
    {
        var commands = ["log", "debug", "info", "warn", "error", "assert", "dir",
            "dirxml", "trace", "group", "groupEnd", "groupCollapsed",
            "time", "timeEnd", "profile", "profileEnd", "count"];

        // Create console API
        for (var i=0; i<commands.length; i++)
        {
            var command = commands[i];
            this[command] = new Function(
                "return window.console.notifyFirebug(arguments, '" + command + "', 'firebugAppendConsole');");
        }

        // Initialize DOM element for communication betwen the web-page a chrome.
        this.getFirebugElement();
    },

    this.notifyFirebug = function(objs, methodName, eventId)
    {
        var element = this.getFirebugElement();

        var event = document.createEvent("Events");
        event.initEvent(eventId, true, false);

        this.userObjects = [];
        for (var i=0; i<objs.length; i++)
            this.userObjects.push(objs[i]);

        var length = this.userObjects.length;
        element.setAttribute("methodName", methodName);
        element.dispatchEvent(event);

        //dump("FirebugConsole dispatched event "+methodName+"\n");
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
        var element = document.getElementById("_firebugConsole");
        if (!element)
        {
            element = document.createElementNS("http://www.w3.org/1999/xhtml","html:div"); // NS for XML/svg
            element.setAttribute("id", "_firebugConsole");
            element.firebugIgnore = true;
            element.setAttribute("style", "display:none");

            var self = this;
            element.addEventListener("firebugCommandLine", function(event)
            {
                var element = event.target;
                var expr = element.getAttribute("expr"); // see commandLine.js
                self.evaluate(expr);
            }, true);

            document.documentElement.appendChild(element);
        }
        return element;
    };

    // ***********************************************************************
    // Console API

    this.__defineGetter__("firebug", function(){
        return this.getFirebugElement().getAttribute("FirebugVersion");
    });

    this.evaluate = function(expr)
    {
        try
        {
            var result = top.eval(expr);
            if (typeof result != "undefined")
                this.notifyFirebug([result], "evaluated", "firebugAppendConsole");
        }
        catch(exc)
        {
            var result = exc;
            result.source = expr;
            this.notifyFirebug([result], "evaluateError", "firebugAppendConsole");
        }
    };
}
//window.dump("============================>>>> Setting _firebug <<<< ====================================\n");
window._firebug =  new _FirebugConsole();
//window.dump("============================>>>> Set _firebug "+window._firebug+" "+window._FirebugConsole+" <<<< ====================================\n");
//for (var p in window.firebug)
//    window.dump(p+"="+window.console[p]+"\n");
window._firebug.init();
