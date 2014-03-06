/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/tree",
    "fbtrace/lib/domplate",
],
function(FBTrace, Tree, Domplate) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

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
            // Special case for Map() instance (from some reason instanceof Map doesn't work).
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
