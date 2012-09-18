/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/promise",
    "firebug/debugger/gripClient",
    "firebug/debugger/grips",
],
function (FBTrace, Firebug, Obj, Promise, GripClient, Grips) {

// ********************************************************************************************* //
// Constants

var gripNull = new Grips.Grip({type: "null"});
var gripUndefined = new Grips.Grip({type: "undefined"});

// ********************************************************************************************* //
// GripCache

function GripCache(connection)
{
    this.connection = connection;

    this.clear();
}

GripCache.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public Cache API

    clear: function()
    {
        this.grips = {};
        this.signatures = {};
    },

    request: function(packet)
    {
        var deferred = Promise.defer();
        this.connection.request(packet, function(response)
        {
            deferred.resolve(response);
        });
        return deferred.promise;
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

    fetchProperties: function(grip)
    {
        if (FBTrace.DBG_GRIPCACHE)
            FBTrace.sysout("gripCache.fetchProperties; ", grip);

        var deferred = Promise.defer();
        var object = this.getObject(grip);
        if (object.loaded)
            return Promise.resolve(object.properties);

        var self = this;
        var gripClient = new GripClient(this.connection, grip);

        gripClient.getPrototypeAndProperties(function(response)
        {
            object.loaded = true;
            object.properties = Grips.Factory.parseProperties(response.ownProperties, self);

            if (FBTrace.DBG_GRIPCACHE)
                FBTrace.sysout("gripCache.onFetchProperties;", object);

            deferred.resolve(object.properties);
        });

        return deferred.promise;
    },

    getSignature: function(grip)
    {
        if (!grip || !grip.actor)
            return null;

        var object = this.signatures[grip.actor];
        if (object)
            return object;

        object = Grips.Factory.createGrip(grip);
        this.signatures[grip.actor] = object;

        return object;
    },

    fetchSignature: function(grip)
    {
        if (FBTrace.DBG_GRIPCACHE)
            FBTrace.sysout("gripCache.fetchSignature; ", grip);

        var deferred = Promise.defer();
        var object = this.getSignature(grip);
        if (object.loaded)
            return Promise.resolve(object.signature);

        var self = this;
        var gripClient = new GripClient(this.connection, grip);

        gripClient.getSignature(function(response)
        {
            object.loaded = true;
            object.signature = response.name + "(" + response.parameters.join(", ") + ")";
            deferred.resolve(object.signature);
        });

        return deferred.promise;
    },
};

// ********************************************************************************************* //
// Registration

return GripCache;

// ********************************************************************************************* //
});
