/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/debugger/grips",
],
function (FBTrace, Obj, Str, Arr, Grips) {

// ********************************************************************************************* //
// Watch Panel Provider

function GripProvider(cache)
{
    this.cache = cache;
}

/**
 * @provider
 */
GripProvider.prototype =
/** @lends GripProvider */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Provider

    hasChildren: function(object)
    {
        if (object instanceof Grips.Property)
        {
            // If the object is a Property than its value (a grip) needs to be investigated.
            object = this.cache.getObject(object.value);
            return object ? this.hasChildren(object) : false;
        }
        else if (object instanceof Grips.Grip)
        {
            // If the value isn't an object, but a primitive there are no children.
            if (typeof(object.value) != "object")
                return false;

            // It could happen that some loaded objects dosn't have any properties
            // (even if at least prototype should be always there). In this case
            // Expanding such object in the UI will just remove the toggle button.
            if (object.loaded && !object.properties.length)
                return false;

            // It looks like the object has children, but we'll see for sure as soon
            // as its children are actualy fetched from the server.
            return true;
        }

        return false;
    },

    getChildren: function(object)
    {
        // Support of arrays (the root or children can be instances of Array)
        if (Arr.isArray(object))
            return object;

        if (object instanceof Grips.Property)
            object = object.value;

        if (!object.actor)
            return [];

        return this.cache.fetchProperties(object);
    },

    getLabel: function(object)
    {
        var text = object.name;

        // Support for string type (children are String instances).
        if (typeof(object) == "string")
            text = object;

        // Cropping is usyally based on extensions.firebug.stringCropLength pref
        // But 50 chars (default value) is not short enough. We need a new pref
        // extensions.firebug.stringCropLengthSmall? (see issue 5898)
        return Str.cropString(text, 25);
    },

    getValue: function(grip)
    {
        if (grip.value && grip.value.type)
        {
            if (grip.value.type == "null")
                return null;
            else if (grip.value.type == "undefined")
                return; // return undefined value
        }

        if (!grip.value)
            return null;

        if (typeof(grip.value) == "object")
            return {type: grip.value["class"]};

        return grip.value;
    },
}

// ********************************************************************************************* //
// Registration

return GripProvider;

// ********************************************************************************************* //
});
