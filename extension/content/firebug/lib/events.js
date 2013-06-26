/* See license.txt for terms of usage */
/*global define:1, Components:1, MouseEvent:1, Window: 1, Firebug:1*/

define([
    "firebug/lib/trace",
    "firebug/lib/xpcom",
    "firebug/lib/wrapper" // dependency will go away with jsd2
],
function(FBTrace, Xpcom, Wrapper) {
"use strict";

// ********************************************************************************************* //
// Constants

const Cu = Components.utils;
const Ci = Components.interfaces;
var elService = Xpcom.CCSV("@mozilla.org/eventlistenerservice;1", "nsIEventListenerService");
var Events = {};

// ********************************************************************************************* //

Events.dispatch = function(listeners, name, args)
{
    if (!listeners)
    {
        if (FBTrace.DBG_DISPATCH)
            FBTrace.sysout("Events.dispatch " + name + " without listeners");

        return;
    }

    try
    {
        var noMethods;
        if (FBTrace.DBG_DISPATCH)
            noMethods = [];

        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if (!listener)
            {
                if (FBTrace.DBG_DISPATCH || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Events.dispatch ERROR " + i + " " + name + " to null listener.");
                continue;
            }

            if (listener[name])
            {
                try
                {
                    listener[name].apply(listener, args);
                }
                catch(exc)
                {
                    if (FBTrace.DBG_ERRORS)
                    {
                        if (exc.stack)
                        {
                            var stack = exc.stack;
                            exc.stack = stack.split('\n');
                        }

                        var culprit = listeners[i] ? listeners[i].dispatchName : null;
                        var loc = (exc.fileName ? exc.fileName + ":" + exc.lineNumber : "<unknown>");
                        FBTrace.sysout("EXCEPTION in Events.dispatch " +
                            (culprit ? culprit + "." : "") + name + ": " + exc + " in " + loc, exc);
                    }
                }
            }
            else
            {
                if (FBTrace.DBG_DISPATCH)
                    noMethods.push(listener);
            }
        }

        if (FBTrace.DBG_DISPATCH)
            FBTrace.sysout("Events.dispatch " + name + " to " + listeners.length + " listeners, " +
                noMethods.length + " had no such method", noMethods);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            if (exc.stack)
            {
                var stack = exc.stack;
                exc.stack = stack.split('\n');
            }

            var culprit = listeners[i] ? listeners[i].dispatchName : null;
            FBTrace.sysout("Exception in Events.dispatch " + (culprit ? culprit + "." : "") +
                name + ": " + exc, exc);
        }
    }
};

Events.dispatch2 = function(listeners, name, args)
{
    try
    {
        var noMethods;
        if (FBTrace.DBG_DISPATCH)
            noMethods = [];

        if (!listeners)
        {
            if (FBTrace.DBG_DISPATCH)
                FBTrace.sysout("dispatch2, no listeners for " + name);
            return;
        }

        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if (listener[name])
            {
                var result = listener[name].apply(listener, args);

                if (FBTrace.DBG_DISPATCH)
                    FBTrace.sysout("dispatch2 " + name + " to #" + i + " of " + listeners.length +
                        " listeners, result " + result, {result: result, listener: listeners[i],
                        fn: listener[name].toSource()});

                if (result)
                    return result;
            }
            else
            {
                if (FBTrace.DBG_DISPATCH)
                    noMethods.push(listener);
            }
        }

        if (FBTrace.DBG_DISPATCH && noMethods.length === listeners.length)
            FBTrace.sysout("Events.dispatch2 " + name + " to " + listeners.length + " listeners, " +
                noMethods.length + " had no such method:", noMethods);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            if (exc.stack)
                exc.stack = exc.stack.split('/n');

            FBTrace.sysout("Exception in Events.dispatch2 " + name + " exc: " + exc, exc);
        }
    }
};

// ********************************************************************************************* //
// Events

Events.cancelEvent = function(event)
{
    event.stopPropagation();
    event.preventDefault();
};

Events.isLeftClick = function(event, allowKeyModifiers)
{
    return event.button === 0 && (allowKeyModifiers || this.noKeyModifiers(event));
};

Events.isMiddleClick = function(event, allowKeyModifiers)
{
    return event.button === 1 && (allowKeyModifiers || this.noKeyModifiers(event));
};

Events.isRightClick = function(event, allowKeyModifiers)
{
    return event.button === 2 && (allowKeyModifiers || this.noKeyModifiers(event));
};

Events.isSingleClick = function(event)
{
    return event instanceof MouseEvent && event.detail === 1;
};

Events.isDoubleClick = function(event)
{
    return event instanceof MouseEvent && event.detail === 2;
};

Events.noKeyModifiers = function(event)
{
    return !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
};

Events.isControlClick = function(event)
{
    return event.button === 0 && this.isControl(event);
};

Events.isShiftClick = function(event)
{
    return event.button === 0 && this.isShift(event);
};

Events.isControl = function(event)
{
    return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
};

Events.isAlt = function(event)
{
    return event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
};

Events.isAltClick = function(event)
{
    return event.button === 0 && this.isAlt(event);
};

Events.isControlShift = function(event)
{
    return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
};

Events.isControlAlt = function(event)
{
    return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.altKey;
};

Events.isShift = function(event)
{
    return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
};

// ********************************************************************************************* //
// DOM Events

const eventTypes =
{
    composition: [
        "composition",
        "compositionstart",
        "compositionend"
    ],

    contextmenu: [
        "contextmenu"
    ],

    drag: [
        "dragenter",
        "dragover",
        "dragexit",
        "dragdrop",
        "draggesture"
    ],

    focus: [
        "focus",
        "blur"
    ],

    form: [
        "submit",
        "reset",
        "change",
        "select",
        "input"
    ],

    key: [
        "keydown",
        "keyup",
        "keypress"
    ],

    load: [
        "load",
        "beforeunload",
        "unload",
        "abort",
        "error"
    ],

    mouse: [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "mouseover",
        "mouseout",
        "mousemove"
    ],

    mutation: [
        "DOMSubtreeModified",
        "DOMNodeInserted",
        "DOMNodeRemoved",
        "DOMNodeRemovedFromDocument",
        "DOMNodeInsertedIntoDocument",
        "DOMAttrModified",
        "DOMCharacterDataModified"
    ],

    paint: [
        "paint",
        "resize",
        "scroll"
    ],

    scroll: [
        "overflow",
        "underflow",
        "overflowchanged"
    ],

    text: [
        "text"
    ],

    ui: [
        "DOMActivate",
        "DOMFocusIn",
        "DOMFocusOut"
    ],

    // xxxHonza: As Simon says, XUL events must die!
    /*xul: [
        "popupshowing",
        "popupshown",
        "popuphiding",
        "popuphidden",
        "close",
        "command",
        "broadcast",
        "commandupdate"
    ],*/

    clipboard: [
        "cut",
        "copy",
        "paste"
    ],

    touch: [
        "touchstart",
        "touchend",
        "touchmove",
        "touchenter",
        "touchleave",
        "touchcancel"
    ]
};

Events.getEventFamilies = function()
{
    var families = [];
    for (var eventFamily in eventTypes)
        families.push(eventFamily);
    return families;
};

Events.getEventTypes = function(family)
{
    var types = [];
    for (var eventFamily in eventTypes)
    {
        if (!family || family === eventFamily)
        {
            for (var type in eventTypes[eventFamily])
                types.push(eventTypes[eventFamily][type]);
        }
    }

    return types;
};

Events.isEventFamily = function(eventType)
{
    return eventTypes.hasOwnProperty(eventType);
};

Events.getEventFamily = function(eventType)
{
    if (!this.families)
    {
        this.families = {};

        for (var family in eventTypes)
        {
            var types = eventTypes[family];
            for (var i = 0; i < types.length; ++i)
                this.families[types[i]] = family;
        }
    }

    return this.families[eventType];
};

Events.attachAllListeners = function(object, listener)
{
    for (var family in eventTypes)
    {
        if (family !== "mutation" || Firebug.attachMutationEvents)
            this.attachFamilyListeners(family, object, listener);
    }
};

Events.detachAllListeners = function(object, listener)
{
    for (var family in eventTypes)
    {
        if (family !== "mutation" || Firebug.attachMutationEvents)
            this.detachFamilyListeners(family, object, listener);
    }
};

Events.attachFamilyListeners = function(family, object, listener)
{
    var types = eventTypes[family];
    for (var i = 0; i < types.length; ++i)
        object.addEventListener(types[i], listener, false);
};

Events.detachFamilyListeners = function(family, object, listener)
{
    var types = eventTypes[family];
    for (var i = 0; i < types.length; ++i)
        object.removeEventListener(types[i], listener, false);
};

// ********************************************************************************************* //
// Event Listeners (+ support for tracking)

var listeners = [];

Events.addEventListener = function(parent, eventId, listener, capturing)
{
    if (FBTrace.DBG_EVENTLISTENERS)
    {
        for (var i = 0; i < listeners.length; i++)
        {
            var l = listeners[i];
            if (l.parent === parent && l.eventId === eventId && l.listener === listener &&
                l.capturing === capturing)
            {
                FBTrace.sysout("Events.addEventListener; ERROR already registered!", l);
                return;
            }
        }
    }

    parent.addEventListener(eventId, listener, capturing);

    if (FBTrace.DBG_EVENTLISTENERS)
    {
        var frames = [];
        for (var frame = Components.stack; frame; frame = frame.caller)
            frames.push(frame.filename + " (" + frame.lineNumber + ")");

        frames.shift();

        var pid = (parent.location ? parent.location + "" : typeof parent);

        listeners.push({
            parentId: pid,
            eventId: eventId,
            capturing: capturing,
            listener: listener,
            stack: frames,
            parent: parent,
        });
    }
};

Events.removeEventListener = function(parent, eventId, listener, capturing)
{
    try
    {
        parent.removeEventListener(eventId, listener, capturing);
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("events.removeEventListener; (" + eventId + ") " + e, e);
    }

    if (FBTrace.DBG_EVENTLISTENERS)
    {
        for (var i = 0; i < listeners.length; i++)
        {
            var l = listeners[i];
            if (l.parent === parent && l.eventId === eventId && l.listener === listener &&
                l.capturing === capturing)
            {
                listeners.splice(i, 1);
                return;
            }
        }

        // xxxHonza: it's not necessary to pollute the tracing console with this message.
        /*
        var frames = [];
        for (var frame = Components.stack; frame; frame = frame.caller)
            frames.push(frame.filename + " (" + frame.lineNumber + ")");

        frames.shift();

        var info = {
            eventId: eventId,
            capturing: capturing,
            listener: listener,
            stack: frames,
        };

        FBTrace.sysout("Events.removeEventListener; ERROR not registered!", info);
        */
    }
};

Events.getEventListenersForTarget = function(target)
{
    var listeners = elService.getListenerInfoFor(target, {});
    var ret = [];
    for (var i = 0; i < listeners.length; ++i)
    {
        var rawListener = listeners[i];
        var listener = {
            type: rawListener.type,
            capturing: rawListener.capturing,
            allowsUntrusted: rawListener.allowsUntrusted,
            func: null
        };
        if ("listenerObject" in rawListener)
        {
            listener.func = rawListener.listenerObject;
        }
        else
        {
            var debugObject = rawListener.getDebugObject();
            listener.func = (debugObject instanceof Ci.jsdIValue && Wrapper.unwrapIValue(debugObject));
        }

        // Skip chrome event listeners.
        if (!listener.func || rawListener.inSystemEventGroup)
            continue;
        var funcGlobal = Cu.getGlobalForObject(listener.func);
        if (!(funcGlobal instanceof Window))
            continue;
        if (funcGlobal.document.nodePrincipal.subsumes(document.nodePrincipal))
            continue;

        ret.push(listener);
    }
    return ret;
};

if (FBTrace.DBG_EVENTLISTENERS && typeof Firebug !== "undefined")
{
    Firebug.Events = {};
    Firebug.Events.getRegisteredListeners = function()
    {
        return listeners;
    };
}

// ********************************************************************************************* //

return Events;

// ********************************************************************************************* //
});
