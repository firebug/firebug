/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/lib/promise",
    "firebug/debugger/rdp",
],
function (FBTrace, Obj, Str, Locale, Promise, RDP) {

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

        //FBTrace.sysout("Grip.hasProperties; " + result, this);

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

        var self = this;
        return this.cache.request(packet).then(function(response)
        {
            self.properties = self.parseProperties(response.ownProperties);
            return self.properties;
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Properties

    createProperty: function(name, packet)
    {
        return new Property(name, packet, this.cache);
    },

    parseProperties: function(ownProperties)
    {
        var result = [];
        for (var name in ownProperties)
            result.push(this.createProperty(name, ownProperties[name], this.cache));
        return result;
    },
}

Firebug.registerDefaultGrip(ObjectGrip);

// ********************************************************************************************* //
// Function Grip

function FunctionGrip(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.signature = null;
}

FunctionGrip.prototype = Obj.descend(new ObjectGrip(),
{
    toString: function()
    {
        return this.getSignature();
    },

    hasProperties: function()
    {
        return false;
    },

    getSignature: function()
    {
        if (this.signature)
            return this.signature;

        var packet = {
            to: this.getActor(),
            type: "parameterNames"
        };

        var self = this;
        return this.cache.request(packet).then(function(response)
        {
            var r = response;
            var params = r.parameters ? r.parameters.join(", ") : "";
            self.signature = r.name + "(" + params + ")";
            return self.signature;
        });
    },

    getType: function()
    {
        return "function";
    },

    getValue: function()
    {
        //xxxHonza: This method is executed 2x more than it should be, why?
        //FBTrace.sysout("FunctionGrip.getValue; " + this.signature)

        if (!this.signature)
            return this.getSignature();

        return this;
    }
});

Firebug.registerGrip("Function", FunctionGrip);

// ********************************************************************************************* //
// LongString

function LongString()
{
}

LongString.prototype = Obj.descend(new ObjectGrip(),
{
});

// ********************************************************************************************* //
// Scope

function Scope(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.properties = null;
}

Scope.prototype = Obj.descend(new ObjectGrip(),
{
    getName: function()
    {
        // Construct the scope name.
        var name = Str.capitalize(this.grip.type);

        // Call the outermost scope Global.
        if (!this.grip.parent)
            name = Locale.$STR("Global Scope");

        var label = name;//Locale.STRF$("scopeLabel", [name]);
        switch (this.grip.type)
        {
            case "with":
            case "object":
                label += " [" + this.grip.object["class"] + "]";
            break;

            case "function":
            if (this.grip.functionName)
                label += " [" + this.grip.functionName + "]";
            break;
        }

        return label;
    },

    hasProperties: function()
    {
        // If properties are loaded, but there are none return false.
        if (this.properties && !this.properties.length)
            return false;

        // xxxHonza: hack, the scope could be empty (= no children).
        return true;
    },

    getProperties: function()
    {
        if (this.properties)
            return this.properties;

        switch (this.grip.type)
        {
            case "with":
            case "object":
                var actor = this.grip.object.actor;
                return ObjectGrip.prototype.getPrototypeAndProperties.call(this, actor);

            case "block":
            case "function":
                var ps = this.properties = [];
                ps.push.apply(ps, this.parseProperties(this.grip.bindings.variables));
                ps.push.apply(ps, this.parseArguments(this.grip.bindings.arguments));
                break;
        }

        return this.properties;
    },

    parseArguments: function(args)
    {
        var result = [];

        if (!args)
            return result;

        for (var i=0; i<args.length; i++)
        {
            var arg = args[i];
            for (var name in arg)
                result.push(this.createProperty(name, arg[name], this.cache));
        }
        return result;
    }
});

// ********************************************************************************************* //
// Property

function Property(name, desc, cache)
{
    this.name = name;

    if (desc)
        this.value = cache ? cache.getObject(desc.value) : desc;

    this.desc = desc;
    this.cache = cache;
}

Property.prototype =
{
    hasChildren: function()
    {
        var result = false;

        if (this.value instanceof ObjectGrip)
            result = this.value.hasProperties();

        //FBTrace.sysout("Property.hasProperties; " + this.name + ", " + result);

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
// Registration

return {
    Property: Property,
    ObjectGrip: ObjectGrip,
    Scope: Scope,
};

// ********************************************************************************************* //
});
