/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/wrapper",
    "firebug/console/console",
    "firebug/console/consoleExposed",
],
function(Firebug, Wrapper, Console, ConsoleExposed) {

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

            // Create a content-owned "console" object, to be exported into the page.
            // We need to use unsafeCloneFunctionIntoContentScope here, since we don't
            // want `console.log(crossOriginWindow)` to throw.
            var sandbox = Cu.Sandbox(win, {wantXrays: false});
            var exposedConsole = Wrapper.unwrapObject(new win.Object());
            for (var prop in console)
            {
                if (!console.hasOwnProperty(prop) || typeof console[prop] !== "function")
                    continue;
                exposedConsole[prop] =
                    Wrapper.unsafeCloneFunctionIntoContentScope(win, sandbox, console[prop]);
            }

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
