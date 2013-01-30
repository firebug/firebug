/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/rdp",
    "firebug/lib/promise",
],
function (FBTrace, RDP, Promise) {

// ********************************************************************************************* //
// Object Grip

function ObjectGrip(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.properties = null;
}

ObjectGrip.prototype =
{
    getActor: function()
    {
        return this.grip.actor;
    },

    getType: function()
    {
        if (this.grip.prototype)
            return this.grip.prototype["class"];

        return this.grip["class"];
    },

    getValue: function()
    {
        switch (this.grip.type)
        {
            case "null":
                return null;
            case "undefined":
                return;
        }

        if (this.properties)
            return createGripProxy(this);

        // Basic grip data packet contains also list of some properties so, it's
        // possible to display some useful info about the object without additional
        // request. Let's use these properties for the value label.
        // See also {@ObjectGrip}
        if (this.grip.ownProperties)
            return this.grip.ownProperties;

        return {type: this.grip.type};
    },

    hasProperties: function()
    {
        var result = true;

        // If the value isn't an object, but a primitive there are no children.
        if (this.grip.type != "object")
            result = false;;

        // It could happen that some loaded objects dosn't have any properties
        // (even if at least prototype should be always there). In this case
        // Expanding such object in the UI will just remove the toggle button.
        if (this.properties && !this.properties.length)
            result = false;

        // It looks like the object has children, but we'll see for sure as soon
        // as its children are actualy fetched from the server.
        return result;
    },

    getProperties: function()
    {
        return this.getPrototypeAndProperties(this.getActor());
    },

    getPrototypeAndProperties: function(actor)
    {
        if (this.properties)
            return this.properties;

        var packet = {
            to: actor,
            type: RDP.DebugProtocolTypes.prototypeAndProperties
        };

        // 'null' and 'undefined' grips don't have cache reference (see GripCache and
        // gripNull and gripUndefined constants).
        if (!this.cache)
        {
            var deferred = Promise.defer();
            deferred.resolve([]);
            return deferred.promise;
        }

        var self = this;
        return this.cache.request(packet).then(
            function onSuccess(response)
            {
                if (response.error)
                {
                    FBTrace.sysout("objectGrip.getPrototypeAndProperties; ERROR " +
                        response.error + ": " + response.message, response);
                    return [];
                }

                self.properties = self.parseProperties(response.ownProperties);
                return self.properties;
            },
            function onError(response)
            {
                FBTrace.sysout("objectGrip.getPrototypeAndProperties; ERROR ", response);
            }
        );
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Properties

    createProperty: function(name, packet)
    {
        return new ObjectGrip.Property(name, packet, this.cache);
    },

    parseProperties: function(ownProperties)
    {
        var result = [];
        for (var name in ownProperties)
            result.push(this.createProperty(name, ownProperties[name], this.cache));
        return result;
    },
}

// ********************************************************************************************* //
// ProxyGrip

function createGripProxy(grip)
{
    // xxxHonza: this is the place where we can use proxies so, Grips are working
    // in DOM panel automatically
    var obj = {};
    for (var i=0; i<grip.properties.length; i++)
    {
        var prop = grip.properties[i];
        obj[prop.name] = prop.value;
    }

    return obj;
}

// ********************************************************************************************* //
// Property

ObjectGrip.Property = function(name, desc, cache)
{
    this.name = name;

    if (desc)
        this.value = cache ? cache.getObject(desc.value) : desc;

    this.desc = desc;
    this.cache = cache;
}

ObjectGrip.Property.prototype =
{
    hasChildren: function()
    {
        var result = false;

        if (this.value instanceof ObjectGrip)
            result = this.value.hasProperties();

        return result;
    },

    getChildren: function()
    {
        if (this.value instanceof ObjectGrip)
            return this.value.getProperties();

        return [];
    },

    getValue: function()
    {
        if (this.value instanceof ObjectGrip)
            return this.value.getValue();

        return this.value;
    },

    getType: function()
    {
        if (this.value instanceof ObjectGrip)
            return this.value.getType();

        return typeof(this.value);
    }
}

// ********************************************************************************************* //
// Registration

return ObjectGrip;

// ********************************************************************************************* //
});
