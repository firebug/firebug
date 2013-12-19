/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/debugger/clients/grip",
    "firebug/debugger/clients/objectClient",
    "firebug/console/errorCopy",
    "firebug/debugger/debuggerLib",
],
function (FBTrace, Obj, Str, Arr, Grip, ObjectClient, ErrorCopy, DebuggerLib) {

// ********************************************************************************************* //
// Watch Panel Provider

function ClientProvider()
{
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

        if (object && Obj.isFunction(object.getName))
            text = object.getName();

        // Support for string type (children are String instances).
        if (typeof(object) == "string")
            text = object;

        if (!text)
            return text;

        // Make sure it's a string
        text += "";

        // Cropping is usually based on extensions.firebug.stringCropLength preference
        // But 50 chars (default value) is not short enough.
        // xxxHonza: Do we need a new one like e.g.: extensions.firebug.stringCropLengthSmall?
        // (see issue 5898)
        return Str.cropString(text, 25);
    },

    getValue: function(object)
    {
        if (object instanceof ObjectClient)
        {
            // If the client object couldn't get data from the server, return the error
            // message (the response) as the value. The UI should be able to deal with the
            // {@ErrorCopy} object.
            if (object.error)
                return new ErrorCopy(object.error.message);
        }

        if (Obj.isFunction(object.getValue))
            return object.getValue();

        if (object instanceof ObjectClient)
            return object.value;

        return object;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // ID Provider

    getId: function(object)
    {
        var label = this.getLabel(object);
        if (label)
            return label;

        if (typeof(object.getActor) == "function")
            return object.getActor();

        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private Helpers

    /**
     * This is the place where we break the RDP feature and access server side objects
     * locally. It's used for providing data to the Watch panel.
     *
     * @param {Object} object Client object with an actor.
     */
    getLocalObject: function(object)
    {
        var actor;

        if (object instanceof Grip)
        {
            actor = object.getActor();
        }
        else
        {
            // The object is already the underlying JS object.
            return object;
        }

        if (!actor)
            return null;

        return DebuggerLib.getObject(this.panel.context, actor);
    },
}

// ********************************************************************************************* //
// Registration

return ClientProvider;

// ********************************************************************************************* //
});
