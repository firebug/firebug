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

        try
        {
            var members = [];

            // Special case for Map() instance (from some reason instanceof Map doesn't work).
            if (typeof (object.forEach) == "function")
            {
                var self = this;
                object.forEach(function(value, name)
                {
                    try
                    {
                        members.push(self.createMember("dom", name, value, level));
                    }
                    catch (e)
                    {
                    }
                });

                return members;
            }

            for (var p in object)
            {
                try
                {
                    members.push(this.createMember("dom", p, object[p], level));
                }
                catch (e)
                {
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
// Registration

return PropertyTree;

// ********************************************************************************************* //
}});
