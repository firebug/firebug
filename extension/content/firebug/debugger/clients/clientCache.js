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
var gripNaN = new ObjectClient({type: "NaN"});

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

    /**
     * Return a client object (i.e. instance of {@link ObjectClient}) according to the
     * grip (handle) passed into the function.
     *
     * The grip can be:
     * 1) Real grip that has its own actor (ID).
     * 2) Wrapped primitive value for undefined, null, +/-Infinity, NaN and -0.
     * 3) Unwrapped for any other primitive value e.g. a number, an empty string, boolean.
     */
    getObject: function(grip)
    {
        // Return if grip is null or undefined. Note that if grip represents null or undefined,
        // it has to be wrapped in JSON in order to be a valid grip.
        if (grip == null)
            return grip;

        // Null and undefined values has it's own type, so return predefined grip.
        // Or again, directly the passed value.
        if (typeof grip === "object" && !grip.actor)
        {
            if (grip.type == "null")
                return gripNull;
            else if (grip.type == "undefined")
                return gripUndefined;
            else if (grip.type == "NaN")
                return gripNaN;

            // Can be a primitive value evaluated to 'true' (e.g. a string, boolean true, etc.).
            return grip;
        }

        var object;

        if (typeof grip === "object")
        {
            object = this.clients[grip.actor];
            if (object)
                return object;
        }

        object = ClientFactory.createClientObject(grip, this);

        // We don't cache primitive grips.
        if (typeof grip === "object")
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
