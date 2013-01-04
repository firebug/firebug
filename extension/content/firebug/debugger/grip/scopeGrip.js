/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/debugger/grip/objectGrip",
],
function (FBTrace, Obj, Str, Locale, ObjectGrip) {

// ********************************************************************************************* //
// Scope

function ScopeGrip(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.properties = null;
}

ScopeGrip.prototype = Obj.descend(new ObjectGrip(),
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
// Registration

return ScopeGrip;

// ********************************************************************************************* //
});
