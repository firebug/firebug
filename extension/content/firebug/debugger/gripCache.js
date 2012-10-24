/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/promise",
    "firebug/debugger/grips",
],
function (FBTrace, Firebug, Obj, Promise, Grips) {

// ********************************************************************************************* //
// Constants

var gripNull = new Grips.ObjectGrip({type: "null"});
var gripUndefined = new Grips.ObjectGrip({type: "undefined"});

// ********************************************************************************************* //
// GripCache

function GripCache(debuggerClient)
{
    this.debuggerClient = debuggerClient;

    // Initialization
    this.clear();
}

GripCache.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Objects

    clear: function()
    {
        for each (var grip in this.grips)
            grip.valid = false;

        this.grips = {};
        this.signatures = {};
    },

    getObject: function(grip)
    {
        if (!grip)
            return null;

        if (!grip.actor)
        {
            if (grip.type == "null")
                return gripNull;
            else if (grip.type == "undefined")
                return gripUndefined;

            // Can be a primitive value (e.g. string).
            return grip;
        }

        var object = this.grips[grip.actor];
        if (object)
            return object;

        object = Grips.Factory.createGrip(grip, this);
        this.grips[grip.actor] = object;

        return object;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Packets

    request: function(packet)
    {
        //xxxHonza: packets should be also cached.

        var deferred = Promise.defer();
        this.debuggerClient.request(packet, function(response)
        {
            deferred.resolve(response);
        });
        return deferred.promise;
    },
};

// ********************************************************************************************* //
// Registration

return GripCache;

// ********************************************************************************************* //
});
