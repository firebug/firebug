/* See license.txt for terms of usage */
/*global define:1, window:1*/

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/events",
    "firebug/lib/domplate",
    "firebug/console/console",
    "firebug/chrome/tableRep",
],
function(Firebug, Module, FBTrace, Obj, Locale, Wrapper, Events, Domplate, Console, TableRep) {

"use strict";

// ********************************************************************************************* //
// Resources

// Bug 912874 - New API to enumerate mutation observers
// Bug 448602 - Have a way to enumerate event listeners
// Issue 6740: Display registered MutationObservers for an element

// ********************************************************************************************* //
// Constants

var {domplate, SPAN, TAG} = Domplate;

var TraceError = FBTrace.toError();

var mutationObservers = "MutationObservers";
var parents = "Parents";

// ********************************************************************************************* //
// Module Implementation

/**
 * @module The modules registers a console listeners that logs a pretty-printed
 * information about listeners and mutation observers for a target element.
 *
 * The log lists listeners/observers registered for the target element as well as those
 * registered for parent elements.
 *
 * The pretty-print log is made only for getEventListeners() return value. So, if the method
 * is used within an expression where the return value is e.g. a particular
 * listener, the pretty-print log is not created.
 *
 * Examples:
 * > getEventListeners(target);             // pretty print log is created.
 * > getEventListeners(target).click[0];    // pretty print log is not created.
 */
var GetEventListenersModule = Obj.extend(Module,
/** @lends GetEventListenersModule */
{
    dispatchName: "getEventListenersModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function()
    {
        Module.initialize.apply(this, arguments);
        Console.addListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
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
        // wrap it before lookup. The map is initialized within onExecuteCommand
        // where the Console log object is created (and exposed to the content).
        object = Wrapper.wrapObject(object);

        // If the currently logged object is stored within the cache-map, we are dealing
        // with a return value of getEventListeners() command. In such case we can append
        // additional pretty-printed info into the Console panel.
        var logInfo = cache.get(object);
        if (logInfo)
            consoleLog(context, logInfo.target, logInfo.listeners, logInfo.observers);
    },
});

// ********************************************************************************************* //
// Command Implementation

/**
 * This function is executed by the framework when getEventListener() is executed
 * on the command line. The first argument must be reference to the target element.
 */
function onExecuteCommand(context, args)
{
    var target = args[0];
    var noParents = args[1] || false;

    if (typeof target !== "object" || target === null)
        return undefined;

    try
    {
        var result = {};

        // Get event listeners and construct the result log-object.
        var listeners = getEventListeners(target, !noParents);
        var map = getListenerMap(listeners.targetListeners);
        if (map)
            result = map;

        // parentListeners array is empty in case of noParents == true.
        map = getListenerMap(listeners.parentListeners);
        if (map)
            result[parents] = map;

        // Append also mutation observers into the result (if there are any).
        var observers = getMutationObservers(target, !noParents);
        if (observers.targetObservers && observers.targetObservers.length > 0)
            result[mutationObservers] = observers.targetObservers;

        // parentObservers array is empty in case of noParents == true.
        if (observers.parentObservers && observers.parentObservers.length > 0)
        {
            if (!result[mutationObservers])
                result[mutationObservers] = [];

            var array = result[mutationObservers];
            array[parents] = observers.parentObservers;
        }

        // Make sure the result structure with listeners and observers is properly
        // cloned into the content scope.
        var global = context.getCurrentGlobal();
        var recursiveClone = function(obj)
        {
            var res;
            if (Array.isArray(obj))
                res = [];
            else if (obj instanceof Object && Object.getPrototypeOf(obj) === Object.prototype)
                res = {};
            else
                return obj;
            for (var prop in obj)
                res[prop] = recursiveClone(obj[prop]);
            return Wrapper.cloneIntoContentScope(global, res);
        };
        var object = recursiveClone(result);

        if (!context.getEventListenersCache)
            context.getEventListenersCache = new WeakMap();

        // The logged object doesn't have any specific type since it is returned
        // from Wrapper.cloneIntoContentScope (using specific types will be
        // able as soon as bug 914970 is fixed).
        // So, store the result logged-object into a weak-map, which will be used
        // later (within 'log' event handler) to figure out whether additional
        // pretty-printed logs should be appended in to the Console.
        // See {@GetEventListenersModule} above.
        context.getEventListenersCache.set(Wrapper.wrapObject(object), {
            target: target,
            listeners: listeners,
            observers: observers
        });

        return object;
    }
    catch (exc)
    {
        TraceError.sysout("getEventListeners FAILS " + exc, exc);
    }

    return undefined;
}

// ********************************************************************************************* //
// Event Listeners

/**
 * Get sorted list of listeners registered for the target and list of listeners
 * registered for all ancestor elements (if required).
 *
 * @param target {Object} The event target for which listeners should be returned.
 * @param includeParents {Boolean} True if parent listeners should also be returned.
 */
function getEventListeners(target, includeParents)
{
    var targetListeners;
    var parentListeners = [];

    // Iterate also all parent nodes and look for listeners that can be
    // executed during bubble phase.
    var element = target;
    while (element)
    {
        try
        {
            var listeners = Events.getEventListenersForTarget(element);

            // Listeners coming from parent elements are stored into
            // parentListeners array.
            if (!targetListeners)
            {
                targetListeners = listeners;
            }
            else
            {
                parentListeners.push.apply(parentListeners, listeners.filter(function(listener)
                {
                    return Events.eventTypeBubblesToDocument(listener.type);
                }));
            }
        }
        catch (exc)
        {
            TraceError.sysout("getEventListenersForTarget threw an EXCEPTION " + exc, exc);
            return undefined;
        }

        // Break the loop if we don't need listeners for element ancestors.
        if (!includeParents)
            break;

        // Use 'parentElement' so, document isn't included as a parent. The document
        // object is special case handled below.
        element = element.parentElement;
    }

    // Special case for document object.
    var doc = target.ownerDocument;
    if (doc && includeParents && target != doc)
    {
        var listeners = Events.getEventListenersForTarget(doc);
        parentListeners.push.apply(parentListeners, listeners.filter(function(listener)
        {
            return Events.eventTypeBubblesToDocument(listener.type);
        }));
    }

    // Special case for window object.
    var win = doc && doc.defaultView;
    if (win && includeParents && target != win)
    {
        var listeners = Events.getEventListenersForTarget(win);
        parentListeners.push.apply(parentListeners, listeners.filter(function(listener)
        {
            return Events.eventTypeBubblesToDocument(listener.type);
        }));
    }

    function sort(a, b)
    {
        if (a.type === b.type)
            return 0;
        return (a.type < b.type ? -1 : 1);
    }

    // Sort listeners by type in alphabetical order, so they show up as such
    // in the returned object.
    targetListeners.sort(sort);
    parentListeners.sort(sort);

    return {
        targetListeners: targetListeners,
        parentListeners: parentListeners
    };
}

/**
 * Transform simple array of listeners into a structure that is directly logged
 * into the Console panel. Note that this result log can be further inspected by the user
 * within the DOM panel.
 */
function getListenerMap(listeners)
{
    if (!listeners || !listeners.length)
        return undefined;

    var map = {};

    for (var i = 0; i < listeners.length; i++)
    {
        var li = listeners[i];
        if (!map[li.type])
            map[li.type] = [];

        map[li.type].push({
            listener: li.listenerObject,
            useCapture: li.capturing,
            target: li.target,
        });
    }

    return map;
}

// ********************************************************************************************* //
// Mutation Observers

/**
 * Get list of mutation observers registered for given target as well as list of observers
 * registered for parent elements (if required). Observers registered for parent elements
 * must have 'subtree' flag set to 'true' to be included in the result list.
 */
function getMutationObservers(target, includeParents)
{
    var targetObservers;
    var parentObservers = [];

    // Iterate all parent nodes and look for observers that are watching
    // also children nodes (subtree == true)
    var element = target;
    while (element)
    {
        var parent = targetObservers;
        var result = getMutationObserversForTarget(element, parent);

        if (!parent)
            targetObservers = result;
        else
            parentObservers.push.apply(parentObservers, result);

        // Break the loop if observers registered for target ancestors aren't required.
        if (!includeParents)
            break;

        element = element.parentNode;
    }

    return {
        targetObservers: targetObservers,
        parentObservers: parentObservers
    };
}

/**
 * Get list of observers registered for specific target.
 */
function getMutationObserversForTarget(target, parent)
{
    var result = [];

    // getBoundMutationObservers() API has been introduced in Firefox 23
    // Also |window| that can be passed as an event target doesn't implement
    // the method.
    if (typeof(target.getBoundMutationObservers) != "function")
        return result;

    // Get all mutation observers registered for given target.
    var observers = target.getBoundMutationObservers();
    for (var i=0; i<observers.length; i++)
    {
        var observer = observers[i];
        var observingInfo = observer.getObservingInfo();
        for (var j=0; j<observingInfo.length; j++)
        {
            var info = observingInfo[j];

            // Get only observers that are registered for:
            // a) the original target
            // b) a parent element with subtree == true.
            if (parent && !info.subtree)
                continue;

            // Prevent chrome observers from leaking into the page.
            var callback = observer.mutationCallback;
            if (!callback || Wrapper.isChromeObject(callback, window))
                continue;

            // OK, insert the observer into the result array.
            result.push({
                attributeOldValue: info.attributeOldValue,
                attributes: info.attributes,
                characterData: info.characterData,
                characterDataOldValue: info.characterDataOldValue,
                childList: info.childList,
                subtree: info.subtree,
                observedNode: info.observedNode,
                mutationCallback: callback,
            });
        }
    }

    return result;
}

// ********************************************************************************************* //
// Console Logging

/**
 * Append pretty-printed information about listeners and mutation observers (for a target)
 * into the Console panel.
 */
function consoleLog(context, target, listenersObj, observersObj)
{
    var input = {
        target: target,
    };

    // Display listeners registered for the target as well as any possible
    // listeners registered for parent elements.
    var listeners = [];
    listeners.push.apply(listeners, listenersObj.targetListeners);
    listeners.push.apply(listeners, listenersObj.parentListeners);

    if (listeners && listeners.length > 0)
    {
        // Group for event listeners list
        input.title = Locale.$STR("eventListeners.group_title");
        Console.openCollapsedGroup(input, context, "eventListenersDetails",
            GroupCaption, true, null, true);

        TableRep.log(listeners, ["type", "capturing", "allowsUntrusted", "func", "target"], context);
        Console.closeGroup(context, true);
    }

    // Similarly as for listeners, the observers list is computed for those observers
    // registered for the target as well as those registered for any ancestor.
    var observers = [];
    observers.push.apply(observers, observersObj.targetObservers);
    observers.push.apply(observers, observersObj.parentObservers);

    if (observers && observers.length > 0)
    {
        // Group for mutation observers list
        input.title = Locale.$STR("mutationObservers.group_title");
        Console.openCollapsedGroup(input, context, "eventListenersDetails",
            GroupCaption, true, null, true);

        TableRep.log(observers, ["attributeOldValue", "attributes", "characterData",
            "characterDataOldValue", "childList", "subtree", "mutationCallback",
            "observedNode"], context);

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
