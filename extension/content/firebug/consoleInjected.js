/* See license.txt for terms of usage */
function _FirebugConsole()
{
    //this.firebug = Firebug.version;

    this.userObjects = [];

    this.notifyFirebug = function(objs, methodName)
    {
        var element = this.getFirebugElement();
        var event = document.createEvent("Events");
        event.initEvent("firebugAppendConsole", true, false);

        element.setAttribute("methodName", methodName);

        element.setAttribute("firstAddition", this.userObjects.length + "");
        for (var i = 0; i < objs.length; i++)
        {
            this.userObjects.push(objs[i]);
        }
        element.setAttribute("lastAddition", this.userObjects.length - 1 + "");
        element.dispatchEvent(event);
        //dump("FirebugConsole dispatched event "+methodName+"\n");
    };

    this.getFirebugElement = function()
    {
        var element = document.getElementById("_firebugConsole");
        if (!element)
        {
            element = document.createElement("div");
            element.setAttribute("id", "_firebugConsole");
            element.setAttribute("class", "firebugIgnore");
            element.setAttribute("style", "display:none");

            var self = this;
            element.addEventListener("firebugCommandLine", function(event)
            {
                var element = event.target;
                var expr = element.getAttribute("expr"); // see commandLine.js
                dump("consoleInjected got event, sending expr to evaluate:"+expr+"\n");
                self.evaluate(expr);
            }, true);

            document.documentElement.appendChild(element);

            var event = document.createEvent("Events");
            event.initEvent("firebugAppendConsole", true, false);
            element.setAttribute("methodName", "init");
            element.setAttribute("firstAddition", "0");
            element.setAttribute("lastAddition", "-1");
            element.dispatchEvent(event);
        }
        return element;
    };

    // ***********************************************************************
    // Console API

    this.firebugVersion = function()
    {
        return this.getFirebugElement().getAttribute("FirebugVersion");
    };

    this.log = function()
    {
        this.notifyFirebug(arguments, "log");
    };

    this.debug = function()
    {
        this.notifyFirebug(arguments, "debug");
    };

    this.info = function()
    {
        this.notifyFirebug(arguments, "info");
    };

    this.warn = function()
    {
        this.notifyFirebug(arguments, "warn");
    };

    this.error = function()
    {
        this.notifyFirebug(arguments, "error" );
    };

    this.assert = function(x)
    {
        if (!x)
        {
            var rest = [];
            for (var i = 1; i < arguments.length; i++)
                rest.push(arguments[i]);
            this.notifyFirebug(rest, "assert");
        }
    };


    this.dir = function(o)
    {
        this.notifyFirebug(arguments, "dir");
    };

    this.dirxml = function(o)
    { this.notifyFirebug(["Window in dirxml", Window], "log");
        if (o instanceof Window)
            o = o.document.documentElement;
        else if (o instanceof Document)
            o = o.documentElement;

        this.notifyFirebug(arguments, "dirxml");
    };

    this.trace = function()
    {
        this.notifyFirebug(arguments, "trace");
    };

    this.group = function()
    {
        this.notifyFirebug(arguments, "group");
    };

    this.groupEnd = function()
    {
        this.notifyFirebug(arguments, "groupEnd");
    };

    this.time = function(name, reset)
    {try {
        if (!name)
            return;

        var time = new Date().getTime();

        if (!this.timeCounters)
            this.timeCounters = {};

        if (!reset && this.timeCounters.hasOwnProperty(name))
            return;

        this.timeCounters[name] = time;
        } catch(e) {
            this.notifyFirebug(["time FAILS", e], "trace");
        }

    };

    this.timeEnd = function(name)
    {
        var time = new Date().getTime();

        if (!this.timeCounters)
            return;

        var timeCounter = this.timeCounters[name];
        if (timeCounter)
        {
            var diff = time - timeCounter;
            var label = name + ": " + diff + "ms";

            this.notifyFirebug([label], "info");

            delete this.timeCounters[name];
        }
        return diff;
    };

    this.profile = function(title)
    {
        this.notifyFirebug(arguments, "profile");
    };

    this.profileEnd = function()
    {
        this.notifyFirebug(arguments, "profileEnd");
    };

    this.count = function(key)
    {
        this.notifyFirebug(arguments, "count");
    };

    this.evaluate = function(expr)
    {
        try
        {
            var result = eval(expr);
            this.notifyFirebug([result], "evaluated");
        }
        catch(exc)
        {
            var result = exc;
            result.source = expr;
            this.notifyFirebug([result], "evaluateError");
        }
    };
}
//window.dump("============================>>>> Setting _firebug <<<< ====================================\n");
window._firebug =  new _FirebugConsole();
//window.dump("============================>>>> Set _firebug "+window._firebug+" "+window._FirebugConsole+" <<<< ====================================\n");
//for (var p in window.firebug)
//    window.dump(p+"="+window.console[p]+"\n");
