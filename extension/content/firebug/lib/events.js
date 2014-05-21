/* See license.txt for terms of usage */
/*global define:1, Components:1, MouseEvent:1, Firebug:1, window:1*/

define([
    "firebug/lib/trace",
    "firebug/lib/wrapper",
],
function(FBTrace, Wrapper) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var elService = Cc["@mozilla.org/eventlistenerservice;1"].getService(Ci.nsIEventListenerService);

// ********************************************************************************************* //
// Implementation

var Events = {};

/**
 * Synchronously dispatch an event to registered listeners. Return values of individual
 * listeners are returned in an array.
 *
 * The return value can be useful especially in case of asynchronous event handling.
 * Every listener handler can return a {@link Promise} that is collected in the result array
 * and so the initiator has a chance to wait till all events (promises) are asynchronously
 * finished.
 *
 * An example:
 *
 * var promises = Events.dispatch("onExampleEvent", [arg1, arg2]);
 * Promise.all(promises).then(function()
 * {
 *     // All event handlers finished
 * });
 *
 * @param {Array} listeners Array with registered listeners.
 * @param {String} name Name of the event being dispatched.
 * @param {Array} args Array with arguments passed to listeners along with the event.
 *
 * @returns {Array} Result array with return values from individual listeners.
 */
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

        var results = [];

        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if (!listener)
            {
                if (FBTrace.DBG_DISPATCH || FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("Events.dispatch ERROR " + i + " " + name +
                        " to null listener.");
                }
                continue;
            }

            if (listener[name])
            {
                try
                {
                    var result = listener[name].apply(listener, args);

                    // Store all valid results into the result array. The only invalid
                    // type is undefined (null, 0 can be treated as valid results in some
                    // cases).
                    if (typeof result != "undefined")
                        results.push(result);
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
                        var loc = (exc.fileName ? exc.fileName + ":" +
                            exc.lineNumber : "<unknown>");

                        FBTrace.sysout("EXCEPTION in Events.dispatch " +
                            (culprit ? culprit + "." : "") + name + ": " +
                            exc + " in " + loc, exc);
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
        {
            FBTrace.sysout("Events.dispatch " + name + " to " + listeners.length +
                " listeners, " + noMethods.length + " had no such method", noMethods);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            if (exc.stack)
            {
                var stack = exc.stack;
                exc.stack = stack.split("\n");
            }

            var culprit = listeners[i] ? listeners[i].dispatchName : null;
            FBTrace.sysout("Exception in Events.dispatch " + (culprit ? culprit + "." : "") +
                name + ": " + exc, exc);
        }
    }

    return results;
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

var eventTypes =
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
        if (family !== "mutation")
            this.attachFamilyListeners(family, object, listener);
    }
};

Events.detachAllListeners = function(object, listener)
{
    for (var family in eventTypes)
    {
        if (family !== "mutation")
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

// Table of non-bubbling event types. It's mostly okay if this gets slightly out
// of date - most event types that don't bubble are only listened to on child
// nodes, and therefore won't incorrectly appear in any UI.
var nonBubbling = {
    abort: 1,
    begin: 1,
    beginEvent: 1,
    blur: 1,
    canplay: 1,
    canplaythrough: 1,
    durationchange: 1,
    emptied: 1,
    end: 1,
    ended: 1,
    endEvent: 1,
    error: 1,
    focus: 1,
    invalid: 1,
    load: 1,
    loadeddata: 1,
    loadedmetadata: 1,
    loadend: 1,
    loadstart: 1,
    mouseenter: 1,
    mouseleave: 1,
    pagehide: 1,
    pageshow: 1,
    pause: 1,
    play: 1,
    playing: 1,
    progress: 1,
    ratechange: 1,
    readystatechange: 1,
    repeat: 1,
    repeatEvent: 1,
    scroll: 1,
    seeked: 1,
    seeking: 1,
    select: 1,
    show: 1,
    stalled: 1,
    suspend: 1,
    SVGLoad: 1,
    SVGUnload: 1,
    timeupdate: 1,
    volumechange: 1,
    waiting: 1,
};

// Return true if a type of DOM event bubbles.
Events.eventTypeBubbles = function(type)
{
    // N.B.: Technically "scroll" is a special case here, since it only bubbles
    // from document to window. But since we are only interested in elements we
    // can ignore that.
    return !nonBubbling.hasOwnProperty(type);
};

// Regex for event types that bubble from elements to document and window.
// It's okay if this gets slightly out of date - it would only imply that some
// event types in the event panel aren't listed on the nodes but as part of
// "document" or "window" instead.
var reBubblesToDocument = new RegExp("^(" +
    "animation(start|end|iteration)|" +
    "transitionend|" +
    "click|dblclick|wheel|mouse(down|up|move)|" +
    "composition(start|end|update)|" +
    "keydown|keypress|keyup|input|contextmenu|" +
    "DOM(AttrModified|NodeRemoved|NodeRemovedFromDocument|SubtreeModified|" +
        "CharacterDataModified|NodeInserted|NodeInsertedIntoDocument)|" +
    "drag(|end|enter|leave|over|start)|" +
    "drop|copy|cut|paste|" +
    "touch(cancel|enter|leave|move|start)" +
")$");

// Return true iff a type of event can bubble up from nodes to document and window.
Events.eventTypeBubblesToDocument = function(type)
{
    return reBubblesToDocument.test(type);
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

        var pid = (parent && parent.location ? String(parent.location) : typeof parent);

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
    for (var i = 0; i < listeners.length; i++)
    {
        var rawListener = listeners[i];
        var listenerObject = rawListener.listenerObject;
        if (!listenerObject)
            continue;

        // For simplicity of use, extract actual listener functions from objects that
        // implement the EventListener interface (i.e. that have "handleEvent" methods).
        var func = listenerObject;
        if (func && typeof func === "object")
        {
            try
            {
                func = func.handleEvent;
            }
            catch (exc) {}
        }
        if (typeof func !== "function")
            func = null;

        // Skip chrome event listeners.
        if (rawListener.inSystemEventGroup || Wrapper.isChromeObject(listenerObject, window))
            continue;

        ret.push({
            type: rawListener.type,
            listenerObject: listenerObject,
            func: func,
            capturing: rawListener.capturing,
            allowsUntrusted: rawListener.allowsUntrusted,
            target: target,
        });
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
