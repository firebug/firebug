/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/debugger/clients/objectClient",
],
function (FBTrace, Obj, Str, Arr, ObjectClient) {

// ********************************************************************************************* //
// Watch Panel Provider

function ClientProvider(cache)
{
    this.cache = cache;
}

/**
 * @provider
 */
ClientProvider.prototype =
/** @lends ClientProvider */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Provider

    hasChildren: function(object)
    {
        if (!object)
            return false;

        if (Obj.isFunction(object.hasChildren))
            return object.hasChildren();

        if (Obj.isFunction(object.hasProperties))
            return object.hasProperties();

        var children = this.getChildren(object);
        return children && children.length > 0;
    },

    getChildren: function(object)
    {
        // Support of arrays (the root or children can be instances of Array)
        if (Arr.isArray(object))
            return object;

        if (Obj.isFunction(object.getChildren))
            return object.getChildren();

        if (Obj.isFunction(object.getProperties))
            return object.getProperties();

        return [];
    },

    getLabel: function(object)
    {
        var text;

        if (object instanceof ObjectClient)
            text = object.name;

        if (object instanceof ObjectClient.Property)
            text = object.name;

        if (Obj.isFunction(object.getName))
            text = object.getName();

        // Support for string type (children are String instances).
        if (typeof(object) == "string")
            text = object;

        if (!text)
            return text;

        // Make sure it's a string
        text += "";

        // Cropping is usually based on extensions.firebug.stringCropLength pref
        // But 50 chars (default value) is not short enough. We need a new pref
        // extensions.firebug.stringCropLengthSmall? (see issue 5898)
        return Str.cropString(text, 25);
    },

    getValue: function(object)
    {
        if (Obj.isFunction(object.getValue))
            return object.getValue();

        if (object instanceof ObjectClient)
            return object.value;

        return object;
    },
}

// ********************************************************************************************* //
// Registration

return ClientProvider;

// ********************************************************************************************* //
});
