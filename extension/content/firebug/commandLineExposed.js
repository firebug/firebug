/* See license.txt for terms of usage */

// ************************************************************************************************
// Command Line APIs

function createFirebugCommandLine(context, win)
{
    var contentView = FBL.getContentView(win);
    if(!contentView)
    {
        if (FBTrace.DBG_COMMANDLINE || FBTrace.DBG_ERRORS)
            FBTrace.sysout("createFirebugCommandLine ERROR no contentView "+context.getName())
            return null;
    }

    var _FirebugCommandLine =
    {
        initFirebugCommandLine: function()
        {
            // Define console functions.
            var commands = ["$", "$$", "$x", "$n", "cd", "clear", "inspect", "keys",
                "values", "debug", "undebug", "monitor", "unmonitor", "traceCalls", "untraceCalls",
                "traceAll", "untraceAll", "monitorEvents", "unmonitorEvents", "profile", "profileEnd", "copy"];

            for (var i=0; i<commands.length; i++)
            {
                var command = commands[i];

                // If the method is already defined, don't override it.
                if (contentView[command])
                    continue;

                //this[command] = new Function(
                //    "return _FirebugCommandLine.notifyFirebug(arguments, '" + command +
                // "', 'firebugExecuteCommand');");

                function createCommandHandler(cmd) {
                    return function() {
                        return _FirebugCommandLine.notifyFirebug(arguments, cmd, 'firebugExecuteCommand');
                    }
                }

                this[command] = createCommandHandler(command);
            }

            // Define console shortcuts
            var consoleShortcuts = ["dir", "dirxml", "table"];
            for (var i=0; i<consoleShortcuts.length; i++)
            {
                var command = consoleShortcuts[i];

                // If the method is already defined, don't override it.
                if (contentView[command])
                    continue;

                //this[command] = new Function("return window.console." + command +
                //    ".apply(window.console, arguments)");

                function createShortcutHandler(cmd) {
                    return function() {
                        return contentView.console[cmd].apply(contentView.console, arguments);
                    }
                }

                this[command] = createShortcutHandler(command);
            }

            // Define console variables.
            var props = ["$0", "$1"];
            for (var j=0; j<props.length; j++)
            {
                var prop = props[j];
                if (contentView[prop])
                    continue;

                this.__defineGetter__(prop, new Function(
                    "return _FirebugCommandLine.notifyFirebug(arguments, '" + prop + "', 'firebugExecuteCommand');"));
            }

            this.attachCommandLine();
        },

        attachCommandLine: function()
        {
            // DBG window.dump("attachCommandLine "+window.location+"\n");
            if (!contentView.console)
            {
                var console = createFirebugConsole(context, win);
                contentView.console = console;
            }
            var self = this;

            this._firebugEvalEvent = function _firebugEvalEvent(event)
            {
                // DBG window.dump("attachCommandLine firebugCommandLine "+window.location+"\n");
                var expr = contentView.document.getUserData("firebug-expr"); // see commandLine.js
                self.evaluate(expr);
                window.dump("attachCommandLine did evaluate on "+expr+"\n");
            }

            contentView.document.addEventListener("firebugCommandLine",this._firebugEvalEvent, true);
            contentView.document.setUserData("firebug-CommandLineAttached", "true", null);
            // DBG window.dump("Added listener for firebugCommandLine event "+window.location+"\n");
        },

        detachCommandLine: function()
        {
             contentView.document.removeEventListener("firebugCommandLine", this._firebugEvalEvent, true);
             delete contentView._FirebugCommandLine; // suicide!
             // DBG window.dump("detachCommmandLine<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n")
        },

        evaluate: function _firebugInjectedEvaluate(expr)
        {
            try
            {
                var result = contentView.eval(expr);
                _FirebugCommandLine.notifyFirebug([result], "evaluated", "firebugAppendConsole");
            }
            catch(exc)
            {
                var result = exc;
                result.source = expr;
                _FirebugCommandLine.notifyFirebug([result], "evaluateError", "firebugAppendConsole");
            }
        },

        notifyFirebug: function _notifyFirebug(objs, methodName, eventID)
        {
            var event = contentView.document.createEvent("Events");
            event.initEvent(eventID, true, false);

            _FirebugCommandLine.userObjects = [];
            for (var i=0; i<objs.length; i++)
                _FirebugCommandLine.userObjects.push(objs[i]);

            var length = _FirebugCommandLine.userObjects.length;
            contentView.document.setUserData("firebug-methodName", methodName, null);

            contentView.document.dispatchEvent(event);

            // DBG dump("FirebugConsole dispatched event "+methodName+" via "+eventID+" with "+length+ " user objects, [0]:"+console.userObjects[0]+"\n");

            var result;
            if (contentView.document.getUserData("firebug-retValueType") == "array")
                result = [];

            if (!result && _FirebugCommandLine.userObjects.length == length+1)
                return _FirebugCommandLine.userObjects[length];

            for (var i=length; i<_FirebugCommandLine.userObjects.length && result; i++)
                result.push(_FirebugCommandLine.userObjects[i]);

            return result;
        }
    };

 // DBG window.dump("_FirebugCommandLine init console is "+window.console+" in "+window.location+"\n");
    _FirebugCommandLine.initFirebugCommandLine();

    return _FirebugCommandLine;
};
