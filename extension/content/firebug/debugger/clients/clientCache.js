/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/promise",
    "firebug/debugger/clients/objectClient",
    "firebug/debugger/clients/clientFactory",
],
function (FBTrace, Firebug, Obj, Promise, ObjectClient, ClientFactory) {

// ********************************************************************************************* //
// Constants

var gripNull = new ObjectClient({type: "null"});
var gripUndefined = new ObjectClient({type: "undefined"});

// ********************************************************************************************* //
// ClientCache

function ClientCache(debuggerClient, context)
{
    this.debuggerClient = debuggerClient;
    this.context = context;

    // Initialization
    this.clear();
}

ClientCache.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Objects

    clear: function()
    {
        for each (var grip in this.clients)
            grip.valid = false;

        this.clients = {};
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

        var object = this.clients[grip.actor];
        if (object)
            return object;

        object = ClientFactory.createClientObject(grip, this);
        this.clients[grip.actor] = object;

        return object;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Packets

    request: function(packet)
    {
        // xxxHonza: packets should be also cached.
        // xxxHonza: we need to check if the same request is in progress and
        // return the existing promise.
        // There should be a map requestID -> promise; where requestID = {actorID + packetType}
        // The same map could be also used to cache the packets.
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

return ClientCache;

// ********************************************************************************************* //
});
