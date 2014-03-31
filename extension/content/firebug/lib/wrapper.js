/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;
var Wrapper = {};

// ********************************************************************************************* //
// Wrappers

Wrapper.getContentView = function(object)
{
    if (isPrimitive(object))
        return object;

    return object.wrappedJSObject;
};

Wrapper.unwrapObject = function(object)
{
    if (isPrimitive(object))
        return object;

    return XPCNativeWrapper.unwrap(object);
};

Wrapper.wrapObject = function(object)
{
    if (isPrimitive(object))
        return object;

    return XPCNativeWrapper(object);
};

Wrapper.isDeadWrapper = function(wrapper)
{
    return Cu.isDeadWrapper(wrapper);
};

Wrapper.isChromeObject = function(obj, chromeWin)
{
    var global = Cu.getGlobalForObject(obj);
    if (!(global instanceof chromeWin.Window))
        return true;

    if (global.document.nodePrincipal.subsumes(chromeWin.document.nodePrincipal))
        return true;

    return false;
};

/**
 * Create a content-accessible view of a simple chrome object. All properties
 * are marked as non-writable, except if they have explicit getters/setters.
 */
Wrapper.cloneIntoContentScope = function(global, obj)
{
    if (!obj || typeof obj !== "object")
        return obj;
    global = Wrapper.wrapObject(global);
    var newObj = (Array.isArray(obj) ? new global.Array() : new global.Object());
    for (var prop in obj)
    {
        var desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (!desc)
            continue;
        if ("writable" in desc)
            desc.writable = false;
        desc.configurable = false;
        Object.defineProperty(newObj, prop, desc);
    }
    Cu.makeObjectPropsNormal(newObj);
    return newObj;
};

// ********************************************************************************************* //

// XXX Obsolete, but left for extension compatibility.
Wrapper.ignoreVars = {};
Wrapper.shouldIgnore = function(name)
{
    return false;
};

function isPrimitive(obj)
{
    return !(obj && (typeof obj === "object" || typeof obj === "function"));
}

// ********************************************************************************************* //
// Registration

return Wrapper;

// ********************************************************************************************* //
});
