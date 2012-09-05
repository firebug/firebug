/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/debugger/gripClient",
],
function (FBTrace, Firebug, Obj, GripClient) {

// ********************************************************************************************* //
// GripCache

function GripCache()
{
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

    getObject: function(connection, grip, callback)
    {
        var object = this.grips[grip.actor];
        if (object)
        {
            callback(object);
            return;
        }

        var self = this;
        var gripClient = new GripClient(connection, grip);

        // Asynchronously fetch the grip from the server.
        gripClient.getPrototypeAndProperties(function(response)
        {
            var object = createProxy(response);
            self.grips[response.from] = object;
            callback(object);
        });
    },
};

// ********************************************************************************************* //
// Proxy Factory

function createProxy(response)
{
    return Proxy.create(
    {
        get: function(receiver, name)
        {
            if (!this.has(name))
                return;

            return response.ownProperties[name].value;
        },

        has: function(name)
        {
            return response.ownProperties.hasOwnProperty(name);
        },

        enumerate: function()
        {
            var props = [];
            for (var name in response.ownProperties)
                props.push(name);
            return props;
        },

        iterate: function()
        {
            var props = this.enumerate();
            var i = 0;
            return {
                next: function() {
                    if (i === props.length)
                        throw StopIteration;
                    return props[i++];
                }
            }
        },

        keys: function()
        {
            return Object.keys(response.ownProperties);
        },
    });
}

// ********************************************************************************************* //
// Registration

return GripCache;

// ********************************************************************************************* //
});
