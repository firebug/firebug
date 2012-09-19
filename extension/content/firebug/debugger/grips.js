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

            default:
                return {type: this.grip.type};
        }
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
            self.properties = Factory.parseProperties(response.ownProperties, self.cache);
            return self.properties;
        });
    },
}

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
            type: RDP.DebugProtocolTypes.nameAndParameters
        };

        var self = this;
        return this.cache.request(packet).then(function(response)
        {
            var r = response;
            self.signature = r.name + "(" + r.parameters.join(", ") + ")";
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

// ********************************************************************************************* //
// LongString Grip

function LongString()
{
    // TODO
}

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
                ps.push.apply(ps, Factory.parseProperties(this.grip.bindings.variables, this.cache));
                ps.push.apply(ps, Factory.parseArguments(this.grip.bindings.arguments, this.cache));
                break;
        }

        return this.properties;
    },
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
// Expression

function WatchExpression(expr)
{
    this.expr = expr;

    // The value is set after the expression is evaluated on the back-end.
    this.value = undefined;
}

WatchExpression.prototype = Obj.descend(new Property(),
{
    getName: function()
    {
        return this.expr;
    }
});

// ********************************************************************************************* //
// Factory

var Factory =
{
    createProperty: function(name, packet, cache)
    {
        return new Property(name, packet, cache);
    },

    createGrip: function(grip, cache)
    {
        switch (grip["class"])
        {
            case "Function":
                return new FunctionGrip(grip, cache);
        }
        return new ObjectGrip(grip, cache);
    },

    parseProperties: function(ownProperties, cache)
    {
        var result = [];
        for (var name in ownProperties)
            result.push(this.createProperty(name, ownProperties[name], cache));
        return result;
    },

    parseArguments: function(args, cache)
    {
        var result = [];

        if (!args)
            return result;

        for (var i=0; i<args.length; i++)
        {
            var arg = args[i];
            for (var name in arg)
                result.push(this.createProperty(name, arg[name], cache));
        }
        return result;
    },

    createScope: function(grip, cache)
    {
        return new Scope(grip, cache);
    }
}

// ********************************************************************************************* //
// Registration

return {
    Property: Property,
    ObjectGrip: ObjectGrip,
    Scope: Scope,
    Factory: Factory,
    WatchExpression: WatchExpression,
};

// ********************************************************************************************* //
});
