/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/console/console",
    "firebug/console/consoleExposed",
    "firebug/console/errors",
],
function(Firebug, Console) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const EXPOSED_CONSOLE_KEY = "fbConsoleExposed"+Math.random();

// ********************************************************************************************* //
// Console Injector

Firebug.Console.injector =
{
    attachConsoleInjector: function(context, win)
    {
        try
        {
            // Get the 'console' object (this comes from chrome scope).
            var console = Firebug.ConsoleExposed.createFirebugConsole(context, win);

            // Do not expose the chrome object as is but, rather do a wrapper, see below.
            //win.wrappedJSObject.console = console;
            //return;

            // Construct a script string that defines a function. This function returns
            // an object that wraps every 'console' method. This function will be evaluated
            // in a window content sandbox and return a wrapper for the 'console' object.
            // Note that this wrapper appends an additional frame that shouldn't be displayed
            // to the user.
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

            // Note: to early to use weakmap's + win.document in case of iframes. So we use an expando.
            Object.defineProperty(win, EXPOSED_CONSOLE_KEY, {
                configurable: true,
                writable: true,
                enumerable: false,
                value: exposedConsole
            });
            win.wrappedJSObject.console = exposedConsole;

            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("console.attachConsoleInjector; Firebug console attached to: " +
                    context.getName());
        }
        catch (ex)
        {
            if (FBTrace.DBG_ERROR)
            {
                FBTrace.sysout("consoleInjector.attachConsoleInjector; exception while injecting",
                    ex);
            }
        }
    },

    getExposedConsole: function(win)
    {
        return win[EXPOSED_CONSOLE_KEY];
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
