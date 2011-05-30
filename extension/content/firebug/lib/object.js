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

Obj.hasProperties = function(ob)
{
    try
    {
        var obString = Str.safeToString(ob);
        if (obString === '[object StorageList]' || obString === '[xpconnect wrapped native prototype]')
            return true;

        for (var name in ob)
        {
            // Try to access the property before declaring existing properties.
            // It's because some properties can't be read see:
            // issue 3843, https://bugzilla.mozilla.org/show_bug.cgi?id=455013
            var value = ob[name];
            return true;
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.hasProperties("+Str.safeToString(ob)+") ERROR "+exc, exc);

        if (ob.wrappedJSObject)  // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
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

// ********************************************************************************************* //

return Obj;

// ********************************************************************************************* //
});
