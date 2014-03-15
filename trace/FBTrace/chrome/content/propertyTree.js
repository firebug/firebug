/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/tree",
    "fbtrace/lib/domplate",
],
function(FBTrace, Tree, Domplate) {
with (Domplate) {

// ********************************************************************************************* //
// PropertyTree Implementation

var PropertyTree = domplate(Tree,
{
    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        var members = [];
        try
        {
            // Special case for Set, Map and Array instances
            if (typeof (object.forEach) == "function")
            {
                var self = this;
                object.forEach(function(value, key)
                {
                    try
                    {
                        members.push(self.createMember("dom", String(key), value, level));
                    }
                    catch (e)
                    {
                    }
                });
            }
            else
            {
                var props = getProperties(object);
                for (var i = 0; i < props.length; i++)
                {
                    var p = props[i];
                    try
                    {
                        members.push(this.createMember("dom", p, object[p], level));
                    }
                    catch (e)
                    {
                    }
                }
            }
        }
        catch (err)
        {
            FBTrace.sysout("Exception", err);
        }

        return members;
    },

    hasMembers: function(value)
    {
        if (!value)
            return false;

        try
        {
            // Special case for Set, Map and Array instances
            if (typeof value.forEach == "function")
            {
                var ret = false;
                value.forEach(function()
                {
                    ret = true;
                });
                return ret;
            }

            var type = typeof value;
            if (type === "object")
                return getProperties(value).length > 0;
            else if (type === "function")
                return functionHasProperties(value);
            else
                return type === "string" && value.length > 50;
        }
        catch (exc)
        {
            return false;
        }
    }
});

// ********************************************************************************************* //
// Helpers

// Create a list of all properties of an object, except those from Object.prototype.
function getProperties(obj)
{
    var props = [];
    var cur = obj;
    var alreadySeen = new Set();
    while (cur && (cur === obj || !isObjectPrototype(cur)))
    {
        Object.getOwnPropertyNames(cur).forEach(function(name)
        {
            if (!alreadySeen.has(name))
            {
                alreadySeen.add(name);
                props.push(name);
            }
        });
        cur = Object.getPrototypeOf(cur);
    }
    return props;
}

function functionHasProperties(fun)
{
    for (var prop in fun)
        return true;
    return fun.prototype && getProperties(fun.prototype).length > 0;
}

function isObjectPrototype(obj)
{
    // Use duck-typing because the object probably comes from a different global.
    return !Object.getPrototypeOf(obj) && "hasOwnProperty" in obj;
}

// ********************************************************************************************* //
// Registration

return PropertyTree;

// ********************************************************************************************* //
}});
