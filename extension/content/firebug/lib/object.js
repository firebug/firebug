/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/lib/string",
],
function(FBTrace, Arr, Str) {

// ********************************************************************************************* //

var Obj = {};

// ********************************************************************************************* //

Obj.bind = function()  // fn, thisObject, args => thisObject.fn(arguments, args);
{
   var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function bind() { return fn.apply(object, Arr.arrayInsert(Arr.cloneArray(args), 0, arguments)); }
};

Obj.bindFixed = function() // fn, thisObject, args => thisObject.fn(args);
{
    var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();
    return function() { return fn.apply(object, args); }
};

Obj.extend = function(l, r)
{
    if (!l || !r)
    {
        FBTrace.sysout("object.extend; ERROR", [l, r]);
        throw new Error("Obj.extend on undefined object");
    }

    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
};

Obj.descend = function(prototypeParent, childProperties)
{
    function protoSetter() {};
    protoSetter.prototype = prototypeParent;
    var newOb = new protoSetter();
    for (var n in childProperties)
        newOb[n] = childProperties[n];
    return newOb;
};

// ************************************************************************************************

/**
 * Returns true if the passed object has any properties, otherwise returns false.
 *
 * @param {Object} ob Inspecte object
 * @param {Object} enumerableOnly Only check enumerable properties (optional)
 * @param {Object} ownOnly Only check own properties not inherited (optional)
 */
Obj.hasProperties = function(ob, enumerableOnly, ownOnly)
{
    try
    {
        if (!ob)
            return false;

        var obString = Str.safeToString(ob);
        if (obString === "[object StorageList]" ||
            obString === "[xpconnect wrapped native prototype]")
        {
            return true;
        }

        // The default case (both options false) is relativelly simple.
        // Just use for..in loop.
        if (!enumerableOnly && !ownOnly)
        {
            for (var name in ob)
            {
                // Try to access the property before declaring existing properties.
                // It's because some properties can't be read see:
                // issue 3843, https://bugzilla.mozilla.org/show_bug.cgi?id=455013
                var value = ob[name];
                return true;
            }
            return false;
        }

        var type = typeof(ob);
        if (type != "object")
        {
            if (type == "string" && ob.length)
                return true;
            return false;
        }

        if (enumerableOnly)
            props = Object.keys(ob);
        else
            props = Object.getOwnPropertyNames(ob);

        if (props.length)
        {
            // Try to access the property before declaring existing properties.
            // It's because some properties can't be read see:
            // issue 3843, https://bugzilla.mozilla.org/show_bug.cgi?id=455013
            var value = ob[props[0]];
            return true;
        }

        // Not interested in inherited properties, bail out.
        if (ownOnly)
            return false;

        // Climb prototype chain.
        var inheritedProps = [];
        var parent = Object.getPrototypeOf(ob);
        if (parent)
            return this.hasProperties(parent, enumerableOnly, ownOnly);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.hasProperties(" + Str.safeToString(ob) + ") ERROR " + exc, exc);

        // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
        if (ob.wrappedJSObject)
            return true;
    }

    return false;
};

Obj.getPrototype = function(ob)
{
    try
    {
        return ob.prototype;
    } catch (exc) {}
    return null;
};


Obj.getUniqueId = function()
{
    return this.getRandomInt(0,65536);
}

Obj.getRandomInt = function(min, max)
{
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// Cross Window instanceof; type is local to this window
Obj.XW_instanceof = function(obj, type)
{
    if (obj instanceof type)
        return true;  // within-window test

    if (!type)
        return false;

    if (!obj)
        return (type == "undefined");

    // compare strings: obj constructor.name to type.name.
    // This is not perfect, we should compare type.prototype to object.__proto__,
    // but mostly code does not change the constructor object.
    do
    {
        // then the function that constructed us is the argument
        if (obj.constructor && obj.constructor.name == type.name)
            return true;
    }
    while(obj = obj.__proto__);  // walk the prototype chain.

    return false;

    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Property_Inheritance_Revisited
    // /Determining_Instance_Relationships
}

/**
 * Tells if the given property of the provided object is a non-native getter or not.
 * This method depends on PropertyPanel.jsm module available in Firefox 5+
 * isNonNativeGetter has been introduced in Firefox 7
 *
 * @param object aObject The object that contains the property.
 * @param string aProp The property you want to check if it is a getter or not.
 * @return boolean True if the given property is a getter, false otherwise.
 */
Obj.isNonNativeGetter = function(obj, propName)
{
    try
    {
        var scope = {};
        Components.utils.import("resource:///modules/PropertyPanel.jsm", scope);

        if (scope.isNonNativeGetter)
        {
            Obj.isNonNativeGetter = scope.isNonNativeGetter;
            return Obj.isNonNativeGetter(obj, propName);
        }
    }
    catch (err)
    {
    }

    return true;
}

// ********************************************************************************************* //

return Obj;

// ********************************************************************************************* //
});
