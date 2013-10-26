/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/debugger/rdp",
    "firebug/lib/promise",
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "firebug/debugger/clients/objectClient",
],
function (FBTrace, Arr, RDP, Promise, FirebugReps, Domplate, ObjectClient) {

// ********************************************************************************************* //
// RemoteNodeListRep

var RemoteNodeListRep = Domplate.domplate(FirebugReps.ArrayLikeObject,
{
    getTitle: function(obj, context)
    {
        return "NodeList";
    },

    longArrayIterator: function(list)
    {
        // xxxHonza: the conversion of the list (map) to an array is the reason
        // why there is this extra template. It would be better to directly reuse
        // the ArrayLikeObject and just modify the supportsObject.
        var array = Arr.values(list);
        return this.arrayIterator(array, 300);
    },

    shortArrayIterator: function(list)
    {
        var array = Arr.values(list);
        return this.arrayIterator(array, Options.get("ObjectShortIteratorMax"));
    },

    supportsObject: function(object, type)
    {
        return (type == "RemoteNodeListRep")
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(RemoteNodeListRep)

return RemoteNodeListRep;

// ********************************************************************************************* //
});
