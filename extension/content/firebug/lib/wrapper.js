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

Wrapper.unwrapIValue = function(object, viewChrome)
{
    var unwrapped = object.getWrappedValue();
    if (viewChrome)
        return unwrapped;

    try
    {
        // XPCSafeJSObjectWrapper is not defined in Firefox 4.0
        // this should be the only call to getWrappedValue in firebug
        if (typeof(XPCSafeJSObjectWrapper) != "undefined")
        {
            return XPCSafeJSObjectWrapper(unwrapped);
        }
        else if (typeof(unwrapped) == "object")
        {
            var result = XPCNativeWrapper.unwrap(unwrapped);
            if (result)
                return result;
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("unwrapIValue FAILS for " + object + " cause: " + exc,
                {exc: exc, object: object, unwrapped: unwrapped});
        }
    }

    return unwrapped;
};

Wrapper.unwrapIValueObject = function(scope, viewChrome)
{
    var scopeVars = {};
    var listValue = {value: null}, lengthValue = {value: 0};
    scope.getProperties(listValue, lengthValue);

    for (var i = 0; i < lengthValue.value; ++i)
    {
        var prop = listValue.value[i];
        var name = Wrapper.unwrapIValue(prop.name);

        if (prop.value.jsType === prop.value.TYPE_NULL) // null is an object (!)
        {
            scopeVars[name] = null;
        }
        else
        {
            if (!Wrapper.shouldIgnore(name))
                scopeVars[name] = Wrapper.unwrapIValue(prop.value, viewChrome);
        }
    }

    return scopeVars;
};

/**
 * Create a content-accessible view of a simple chrome object. All properties
 * are marked as non-writable, except if they have explicit getters/setters.
 */
Wrapper.cloneIntoContentScope = function(global, obj)
{
    if (!obj || typeof obj !== "object")
        return obj;
    var newObj = (Array.isArray(obj) ? Cu.createArrayIn(global) : Cu.createObjectIn(global));
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

Wrapper.ignoreVars =
{
    // internal firebug things XXXjjb todo we should privatize these
    "_firebug": 1,
    "__fb_scopedVars": 1,
};

Wrapper.shouldIgnore = function(name)
{
    return (Wrapper.ignoreVars[name] === 1);
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
