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
// GripCache

function GripCache(connection)
{
    this.connection = connection;
    this.grips = {};
}

GripCache.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public Cache API

    clear: function()
    {
        this.grips = {};
    },

    getObject: function(grip)
    {
        if (!grip || !grip.actor)
            return null;

        var object = this.grips[grip.actor];
        if (object)
            return object;

        object = Grips.Factory.createGrip(grip);
        this.grips[grip.actor] = object;

        return object;
    },

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
            object.properties = Grips.Factory.parseProperties(response.ownProperties);

            if (FBTrace.DBG_GRIPCACHE)
                FBTrace.sysout("gripCache.onFetchProperties;", object);

            deferred.resolve(object.properties);
        });

        return deferred.promise;
    },
};

// ********************************************************************************************* //
// Registration

return GripCache;

// ********************************************************************************************* //
});
