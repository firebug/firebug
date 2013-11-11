/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/debugger/clients/objectClient",
],
function (FBTrace, Obj, Str, Locale, ObjectClient) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_SCOPECLIENT");

// ********************************************************************************************* //
// Scope

function ScopeClient(grip, cache, options)
{
    this.grip = grip;
    this.cache = cache;
    this.readOnly = options.readOnly;
    this.properties = null;
    this.error = null;
}

ScopeClient.prototype = Obj.descend(new ObjectClient(),
{
    getName: function()
    {
        // Construct the scope name.
        var name = Str.capitalize(this.grip.type);

        // If there is no parent the scope is global.
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

    getValue: function()
    {
        // xxxHonza: needs refactoring (e.g. we need WindowGrip object)
        // Global scope is usually a window, which is displayed with href.

        var object;
        switch (this.grip.type)
        {
            case "with":
            case "object":
                object = this.cache.getObject(this.grip["object"]);
            break;

            case "function":
                object = this.cache.getObject(this.grip["function"]);
            break;
        }

        if (object)
            return object.getValue();

        return ObjectClient.prototype.getValue.apply(this, arguments);
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
                return ObjectClient.prototype.getPrototypeAndProperties.call(this, actor);

            case "block":
            case "function":
                var ps = this.properties = [];
                ps.push.apply(ps, this.parseArguments(this.grip.bindings.arguments));
                ps.push.apply(ps, this.parseProperties(this.grip.bindings.variables));
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

        Trace.sysout("scopeClient.parseArguments; ", {
            grip: this.grip,
            result: result,
        });

        return result;
    }
});

// ********************************************************************************************* //
// Registration

return ScopeClient;

// ********************************************************************************************* //
});
