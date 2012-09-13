/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/lib/promise",
],
function (FBTrace, Obj, Str, Locale, Promise) {

// ********************************************************************************************* //
// Factory

var Factory =
{
    createProperty: function(name, packet)
    {
        return new Property(name, packet);
    },

    createGrip: function(grip)
    {
        var result = new Grip(grip);
        return result;
    },

    parseProperties: function(ownProperties)
    {
        var result = [];
        for (var name in ownProperties)
            result.push(this.createProperty(name, ownProperties[name]));
        return result;
    },

    createScope: function(grip)
    {
        return new Scope(grip);
    }
}

// ********************************************************************************************* //
// Property

function Property(name, desc)
{
    this.name = name;
    this.value = desc.value;
    this.enumerable = desc.enumerable;
    this.configurable = desc.configurable;
    this.writable = desc.writable;
}

Property.prototype =
{
    hasProperties: function()
    {
        // There are properties only if the value is an object (grip)
        return this.value instanceof Grip;
    },

    getProperties: function()
    {
        if (this.hasProperties())
            return this.value.getPrototypeAndProperties();

        return [];
    },

    getValue: function()
    {
        return this.value;
    }
}
// ********************************************************************************************* //
// Grip

function Grip(grip)
{
    this.actor = grip.actor;
    this.className = grip["class"];
    this.type = grip.type;

    this.loaded = false;
    this.properties = [];
    this.value = null;
}

Grip.prototype =
{
    isLoaded: function()
    {
        return this.loaded;
    },

    getPrototypeAndProperties: function()
    {
        if (!this.loaded)
            return [];

        var result = [];
        for (var prop in this.value)
            result.push(this.value[prop]);

        return result;
    },
}

// ********************************************************************************************* //
// Scope

function Scope(grip)
{
    this.grip = grip;
    this.properties = null;
}

Scope.prototype = Obj.extend(Grip.prototype,
{
    getValue: function()
    {
        return {type: this.grip.type};
    },

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

    getProperties: function(cache)
    {
        if (this.properties)
            return this.properties;

        switch (this.grip.type)
        {
            case "with":
            case "object":
                return cache.fetchProperties(this.grip.object);

            case "block":
            case "function":
                this.properties = [];
                this.properties.push.apply(this.properties, Factory.parseProperties(
                    this.grip.bindings.variables));
                break;
        }

        return this.properties;
    },
});

// ********************************************************************************************* //
// Frame

// ********************************************************************************************* //
// Expression

// xxxHonza: should this be derived from Grip?
function WatchExpression(expr)
{
    this.expr = expr;
    this.value = undefined; // will be set after evaluation
}

// ********************************************************************************************* //
// Registration

return {
    Property: Property,
    Grip: Grip,
    Scope: Scope,
    Factory: Factory,
    WatchExpression: WatchExpression,
};

// ********************************************************************************************* //
});
