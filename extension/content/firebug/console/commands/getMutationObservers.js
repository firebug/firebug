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

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context, args)
{
    var target = args[0];
    if (typeof target !== "object" || target === null)
        return undefined;

    if (typeof(target.getBoundMutationObservers) !== "function")
    {
        var msg = "ERROR not supported by the current version of " +
            "Firefox (see: https://bugzilla.mozilla.org/show_bug.cgi?id=912874)";

        FBTrace.sysout("getMutationObservers: " + msg);
        return Firebug.Console.logFormatted([msg], context, "warn");
    }

    var global = context.getCurrentGlobal();
    var ret = [];

    var observers = target.getBoundMutationObservers();
    FBTrace.sysout("observers " + observers.length);
    for (var i=0; i<observers.length; i++)
    {
        var observer = observers[i];
        var infos = observer.getObservingInfo();
        FBTrace.sysout("infos " + infos.length);
        for (var j=0; j<infos.length; j++)
        {
            var info = infos[j];
            ret.push(Wrapper.cloneIntoContentScope(global, {
                attributeOldValue: info.attributeOldValue,
                attributes: info.attributes,
                characterData: info.characterData,
                characterDataOldValue: info.characterDataOldValue,
                childList: info.childList,
                subtree: info.subtree,
                observedNode: info.observedNode,
                mutationCallback: observer.mutationCallback,
            }));
        }
    }

    return Wrapper.cloneIntoContentScope(global, ret);
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("getMutationObservers", {
    helpUrl: "https://getfirebug.com/wiki/index.php/getMutationObservers",
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.getMutationObservers")
});

return {
    getMutationObservers: onExecuteCommand
};

// ********************************************************************************************* //
});
