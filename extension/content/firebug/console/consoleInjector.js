/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/console/console",
    "firebug/console/consoleExposed",
],
function(Firebug, Console, ConsoleExposed) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var wmExposedConsoles = new WeakMap();

// ********************************************************************************************* //
// Console Injector

Firebug.Console.injector =
{
    attachConsoleInjector: function(context, win)
    {
        try
        {
            var url = win.location.href;
            var winDoc = win.document;
            // Don't run the function twice for the same window and the same context.
            if (wmExposedConsoles.has(winDoc) &&
                wmExposedConsoles.get(winDoc).context === context)
            {
                if (FBTrace.DBG_CONSOLE)
                    FBTrace.sysout("Console already attached for " + url + ". Skipping.");
                return;
            }
            // Get the 'console' object (this comes from chrome scope).
            var console = ConsoleExposed.createFirebugConsole(context, win);

            // Do not expose the chrome object as is but, rather do a wrapper, see below.
            //win.wrappedJSObject.console = console;
            //return;

            // Construct a script string that defines a function. This function returns
            // an object that wraps every 'console' method. This function will be evaluated
            // in a window content sandbox and return a wrapper for the 'console' object.
            // Note that this wrapper appends an additional frame that shouldn't be displayed
            // to the user.
            //
            // Since we are using .caller and .arguments for stack walking, the function must
            // not be in strict mode.
            var expr = "(function(x) { return {\n";
            for (var p in console)
            {
                var func = console[p];
                if (typeof(func) == "function")
                {
                    expr += p + ": function() { return Function.apply.call(x." + p +
                        ", x, arguments); },\n";
                }
            }
            expr += "};})";

            // Evaluate the function in the window sandbox/scope and execute. The return value
            // is a wrapper for the 'console' object.
            var sandbox = Cu.Sandbox(win);
            var getConsoleWrapper = Cu.evalInSandbox(expr, sandbox);
            var exposedConsole = getConsoleWrapper(console);

            // Store the context and the exposedConsole in a WeakMap.
            wmExposedConsoles.set(winDoc, {
                context: context,
                console: exposedConsole
            });

            win.wrappedJSObject.console = exposedConsole;

            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("console.attachConsoleInjector; Firebug console attached to: " +
                    url);
        }
        catch (ex)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("consoleInjector.attachConsoleInjector; exception while injecting",
                    ex);
            }
        }
    },

    getExposedConsole: function(win)
    {
        var winDoc = win.document;
        return  wmExposedConsoles.has(winDoc) ?
                wmExposedConsoles.get(winDoc).console :
                undefined;
    },

    // For extensions that still use this function.
    getConsoleHandler: function(context, win)
    {
        return {
            win: Wrapper.wrapObject(win),
            context: context,
            console: this.getExposedConsole(win)
        };
    }
};

// ********************************************************************************************* //
// Registration

return Firebug.Console.injector;

// ********************************************************************************************* //
});
