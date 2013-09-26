/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/xpcom",
    "firebug/lib/events",
    "firebug/lib/domplate",
    "firebug/console/console",
    "firebug/chrome/tableRep",
],
function(Firebug, FBTrace, Obj, Locale, Wrapper, Xpcom, Events, Domplate, Console, TableRep) {

"use strict";

// ********************************************************************************************* //
// Resources

// Bug 912874 - New API to enumerate mutation observers
// Bug 448602 - Have a way to enumerate event listeners

// ********************************************************************************************* //
// Constants

var {domplate, SPAN, TAG, DIV} = Domplate;

var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Module Implementation

/**
 * @module The modules registers a console listeners that logs a pretty-printed
 * information about listeners and mutation observers for specific target.
 * The pretty-print log is made only for getEventListeners() return value, so
 * if the method is used within an expression it's always just the result of the expression
 * which is logged.
 */
var GetEventListenersModule = Obj.extend(Firebug.Module,
/** @lends GetEventListenersModule */
{
    dispatchName: "getEventListenersModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function(prefDomain, prefNames)
    {
        Firebug.Module.initialize.apply(this, arguments);
        Console.addListener(this);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
        Console.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Console Listener

    log: function(context, object, className, sourceLink)
    {
        if (!context || !object)
            return;

        // The log we are waiting for must be Object type.
        if (typeof(object) != "object")
            return;

        var cache = context.getEventListenersCache;
        if (!cache)
            return false;

        // Objects keys in the cache-map are using wrappers, so don't forget to
        // wrap it before lookup.
        object = Wrapper.wrapObject(object);

        // If the currently logged object is stored within the cache-map, we are dealing
        // with a return value of getEventListeners() command. In such case append
        // additional pretty-printed info into the Console panel.
        var logInfo = cache.get(object);
        if (logInfo)
            consoleLog(context, logInfo.target, logInfo.listeners, logInfo.observers);
    },
});

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context, args)
{
    var target = args[0];
    if (typeof target !== "object" || target === null)
        return undefined;

    try
    {
        var result = {};

        // Get event listeners.
        var listeners = getEventListenersForTarget(context, target);
        if (listeners)
            result = listeners;

        // Append also mutation observers into the result (if there are any).
        var observers = getMutationObserversForTarget(context, target);
        if (observers && observers.length > 0)
            result["MutationObservers"] = observers;

        // Make sure the result structure with listeners and observers is properly
        // cloned into the content scope.
        var global = context.getCurrentGlobal();
        var objects = Wrapper.cloneIntoContentScope(global, result);

        if (!context.getEventListenersCache)
            context.getEventListenersCache = new WeakMap();

        // The logged object doesn't have any specific type since returned from
        // Wrapper.cloneIntoContentScope, which is based on Cu.createObjectIn.
        // (using specific types will be able as soon as bug 914970 is fixed)
        // So, store the result logged-object into a weak-map, which will be used
        // later (within 'log' event handler) to figure out whether additional
        // pretty-printed logs should be appended in to the Console.
        // See {@GetEventListenersModule} above.
        context.getEventListenersCache.set(objects, {
            target: target,
            listeners: listeners,
            observers: observers
        });

        return objects;
    }
    catch (exc)
    {
        TraceError.sysout("getEventListeners FAILS to create content view " + exc, exc);
    }

    return undefined;
}

// ********************************************************************************************* //
// Event Listeners

function getEventListenersForTarget(context, target)
{
    var listeners;

    try
    {
        listeners = Events.getEventListenersForTarget(target);
    }
    catch (exc)
    {
        TraceError.sysout("getEventListenersForTarget threw an EXCEPTION " + exc, exc);
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
        var result = {};
        for (let li of listeners)
        {
            if (!result[li.type])
                result[li.type] = [];

            result[li.type].push(Wrapper.cloneIntoContentScope(global, {
                listener: li.func,
                useCapture: li.capturing
            }));
        }

        return result;
    }
    catch (exc)
    {
        TraceError.sysout("getEventListeners FAILS to create content view " + exc, exc);
    }

    return undefined;
}

// ********************************************************************************************* //
// Mutation Observers

function getMutationObserversForTarget(context, target)
{
    var result = [];

    // xxxHonza: avoid exception in preceding Firefox 23 versions (we can remove at some point).
    if (typeof(target.getBoundMutationObservers) !== "function")
        return undefined;

    var global = context.getCurrentGlobal();

    // Iterate all parent nodes and look for observers that are watching
    // also children nodes (subtree == true)
    var element = target;
    while (element)
    {
        // Get all mutation observers registered for specified element.
        var observers = element.getBoundMutationObservers();
        for (var i=0; i<observers.length; i++)
        {
            var observer = observers[i];
            var infos = observer.getObservingInfo();
            for (var j=0; j<infos.length; j++)
            {
                var info = infos[j];

                // Get only observers that are registered for:
                // a) the original target
                // b) a parent element with subtree == true.
                if (!info.subtree && element != target)
                    continue;

                // OK, insert the observer into the result array.
                result.push(Wrapper.cloneIntoContentScope(global, {
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

        element = element.parentNode;
    }

    return result;
}

// ********************************************************************************************* //
// Console Logging

/**
 * Append pretty-printed information about listeners and mutation observers (for a target)
 * into the Console panel.
 */
function consoleLog(context, target, listeners, observers)
{
    var input = {
        target: target,
    };

    // xxxHonza: fix me, this is the second time we get the listeners.
    listeners = Events.getEventListenersForTarget(target);
    if (listeners && listeners.length > 0)
    {
        // Group for event listeners list
        input.title = Locale.$STR("eventListeners.group_title");
        var row = Console.openCollapsedGroup(input, context, "eventListenersDetails",
            GroupCaption, true, null, true);

        TableRep.log(listeners, ["type", "capturing", "allowsUntrusted", "func"], context);
        Console.closeGroup(context, true);
    }

    if (observers && observers.length > 0)
    {
        // Group for mutation observers list
        input.title = Locale.$STR("mutationObservers.group_title");
        row = Console.openCollapsedGroup(input, context, "eventListenersDetails",
            GroupCaption, true, null, true);

        TableRep.log(observers, ["attributeOldValue", "attributes", "characterData",
            "characterData", "characterDataOldValue", "childList", "subtree", "observedNode",
            "mutationCallback"], context);

        Console.closeGroup(context, true);
    }
}

// ********************************************************************************************* //
// Domplate Templates

var GroupCaption = domplate(
{
    tag:
        SPAN({"class": "eventListenersTitle"},
            SPAN({"class": "eventListenersCaption"},
                "$object.title"
            ),
            SPAN("&nbsp;"),
            SPAN("&#187;"),
            SPAN("&nbsp;"),
            SPAN({"class": "eventListenersTarget"},
                TAG("$object|getTargetTag", {object: "$object.target"})
            )
        ),

    getTargetTag: function(object)
    {
        var rep = Firebug.getRep(object.target);
        return rep.shortTag ? rep.shortTag : rep.tag;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(GetEventListenersModule);

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
