/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/xpcom",
    "firebug/lib/events",
],
function(Firebug, FBTrace, Locale, Wrapper, Xpcom, Events) {

"use strict";

// ********************************************************************************************* //
// Constants

const comparator = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const appInfo = Xpcom.CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
var pre23 = (comparator.compare(appInfo.version, "23.0*") < 0);

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context, args)
{
    var target = args[0];
    if (typeof target !== "object" || target === null)
        return undefined;

    if (pre23 && !context.getPanel("script", true))
    {
        // XXXsimon: Don't bother translating this, it will go away in one release,
        // happen very seldom, and English error messages look better anyway.
        throw new Error("getEventListeners requires the Script panel to be enabled " +
            "(or the use of Firefox 23 or higher)");
    }

    var listeners;
    try
    {
        listeners = Events.getEventListenersForTarget(target);
    }
    catch (exc)
    {
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("getEventListenersForTarget threw an exception", exc);

        return undefined;
    }

    // Sort listeners by type in alphabetical order, so they show up as such
    // in the returned object.
    listeners.sort(function(a, b)
    {
        if (a.type === b.type)
            return 0;
        return (a.type < b.type ? -1 : 1);
    });

    try
    {
        var global = context.getCurrentGlobal();
        var ret = {};
        for (let li of listeners)
        {
            if (!ret[li.type])
                ret[li.type] = [];

            ret[li.type].push(Wrapper.cloneIntoContentScope(global, {
                listener: li.func,
                useCapture: li.capturing
            }));
        }

        return Wrapper.cloneIntoContentScope(global, ret);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getEventListeners FAILS to create content view" + exc, exc);
    }

    return undefined;
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("getEventListeners", {
    helpUrl: "https://getfirebug.com/wiki/index.php/getEventListeners",
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.getEventListeners")
});

return {
    getEventListeners: onExecuteCommand
};

// ********************************************************************************************* //
});
