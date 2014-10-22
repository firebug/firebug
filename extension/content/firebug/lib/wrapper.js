/* See license.txt for terms of usage */

define([
],
function() {

// Note: .caller and .arguments are used for stack walking past
// unsafeCloneFunctionIntoContentScope, so we can not use strict mode here.
//"use strict";

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
 * Create a content-accessible view of a simple chrome object or function. All
 * properties are marked as non-writable, except if they have explicit getters/setters.
 */
Wrapper.cloneIntoContentScope = function(global, obj)
{
    global = Wrapper.wrapObject(global);
    if (typeof obj === "function")
        return cloneFunction(global, obj);
    if (!obj || typeof obj !== "object")
        return obj;
    var newObj = (Array.isArray(obj) ? new global.Array() : new global.Object());
    newObj = XPCNativeWrapper.unwrap(newObj);
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

/**
 * Create a clone of a function usable from within a content global similarly to
 * cloneIntoContentScope, except that it accepts even cross-origin objects
 * as arguments. A sandbox, which must be created with:
 * `Cu.Sandbox(win, {wantXrays: false})`, is used for the marshalling.
 */
Wrapper.unsafeCloneFunctionIntoContentScope = function(win, sandbox, func)
{
    // Delegate from the sandbox, which accepts anything, to chrome space by
    // passing the arguments object as a single argument, which is then
    // unwrapped. Since checking for dangerous objects only goes one level
    // deep, this avoids problems with arguments getting denied entry.
    // Return a bound function, so as to get "[native code]" in the function
    // stringification.
    function chromeForwarder(args)
    {
        var unwrappedArgs = XPCNativeWrapper.unwrap(args);
        var wrappedArgs = [];
        for (var i = 0; i < unwrappedArgs.length; i++)
            wrappedArgs.push(XPCNativeWrapper(unwrappedArgs[i]));
        return func.apply(null, wrappedArgs);
    }

    var expr = "(function(x) { return function() { return x(arguments); }.bind(null); })";
    var makeContentForwarder = Cu.evalInSandbox(expr, sandbox);
    return makeContentForwarder(cloneFunction(win, chromeForwarder));
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

function cloneFunction(win, func)
{
    var obj = XPCNativeWrapper.unwrap(new win.Object());
    var desc = {value: func, writable: true, configurable: true, enumerable: true};
    Object.defineProperty(obj, "f", desc);
    Cu.makeObjectPropsNormal(obj);
    return obj.f;
}

// ********************************************************************************************* //
// Registration

return Wrapper;

// ********************************************************************************************* //
});
