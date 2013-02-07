/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/array",
],
function(FBTrace, Arr) {

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

var Obj = {};

// ********************************************************************************************* //

// fn, thisObject, args => thisObject.fn(arguments, args);
Obj.bind = function()
{
   var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function bind() { return fn.apply(object, Arr.arrayInsert(Arr.cloneArray(args), 0, arguments)); };
};

// fn, thisObject, args => thisObject.fn(args);
Obj.bindFixed = function()
{
    var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();
    return function() { return fn.apply(object, args); };
};

Obj.extend = function()
{
    if (arguments.length < 2)
    {
        FBTrace.sysout("object.extend; ERROR", arguments);
        throw new Error("Obj.extend on undefined object");
    }

    var newOb = {};
    for (var i = 0, len = arguments.length; i < len; ++i)
    {
        for (var prop in arguments[i])
            newOb[prop] = arguments[i][prop];
    }

    return newOb;
};

// ************************************************************************************************

/**
 * Returns true if the passed object has any properties, otherwise returns false.
 *
 * @param {Object} ob Inspected object
 * @param {Object} nonEnumProps If set to true, check also non-enumerable properties (optional)
 * @param {Object} ownPropsOnly If set to true, only check own properties not inherited (optional)
 */
Obj.hasProperties = function(ob, nonEnumProps, ownPropsOnly)
{
    try
    {
        if (!ob)
            return false;

        try
        {
            // This is probably unnecessary in Firefox 19 or so.
            if ("toString" in ob && ob.toString() === "[xpconnect wrapped native prototype]")
                return true;
        }
        catch (exc) {}

        // The default case (both options false) is relatively simple.
        // Just use for..in loop.
        if (!nonEnumProps && !ownPropsOnly)
        {
            for (var name in ob)
                return true;
            return false;
        }

        var type = typeof(ob);
        if (type == "string" && ob.length)
            return true;
         
        if (type === "number" || type === "boolean" || type === "undefined" || ob === null)
            return false;

        if (nonEnumProps)
            props = Object.getOwnPropertyNames(ob);
        else
            props = Object.keys(ob);

        if (props.length)
            return true;

        // Not interested in inherited properties, bail out.
        if (ownPropsOnly)
            return false;

        // Climb prototype chain.
        var parent = Object.getPrototypeOf(ob);
        if (parent)
            return this.hasProperties(parent, nonEnumProps, ownPropsOnly);
    }
    catch (exc)
    {
        // Primitive (non string) objects will throw an exception when passed into
        // Object.keys or Object.getOwnPropertyNames APIs.
        // There are also many "security error" exceptions I guess none of which are really
        // necessary to display in the FBTrace console, so, remove the tracing for now.
        // if (FBTrace.DBG_ERRORS)
        //     FBTrace.sysout("lib.hasProperties(" + Str.safeToString(ob) + ") ERROR " + exc, exc);

        // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
        if (ob.wrappedJSObject)
            return true;
    }

    return false;
};

// ********************************************************************************************* //

return Obj;

// ********************************************************************************************* //
});
