/* See license.txt for terms of usage */

define([
    "fbtrace/lib/domplate",
    "fbtrace/lib/string",
    "fbtrace/lib/locale",
],
function(Domplate, Str, Locale) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Reps = {};

// ********************************************************************************************* //
// Rep

Reps.Rep = domplate(
{
    className: "",
    inspectable: true,

    supportsObject: function(object, type)
    {
        return false;
    },

    getTitle: function(object)
    {
        try
        {
            if (object.constructor && typeof(object.constructor) == 'function')
            {
                var ctorName = object.constructor.name;
                // xxxsz: Objects with 'Object' as constructor name should also be shown.
                // See issue 6148.
                if (ctorName)
                    return ctorName;
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Rep.getTitle; EXCEPTION " + e, e);
        }

        var label = Str.safeToString(object); // eg [object XPCWrappedNative [object foo]]

        const re =/\[object ([^\]]*)/;
        var m = re.exec(label);
        var n = null;
        if (m)
            n = re.exec(m[1]);  // eg XPCWrappedNative [object foo

        if (n)
            return n[1];  // eg foo
        else
            return m ? m[1] : label;
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        return false;
    },

    getTooltip: function(object)
    {
        return null;
    },

    /**
     * Called by chrome.onContextMenu to build the context menu when the underlying object
     * has this rep. See also Panel for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     *
     * @param object: the 'realObject', a model value, eg a DOM property
     * @param target: the HTML element clicked on.
     * @param context: the context, probably Firebug.currentContext
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target, context)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Convenience for domplates

    STR: function(name)
    {
        return Locale.$STR(name);
    },

    cropString: function(text)
    {
        return Str.cropString(text);
    },

    cropMultipleLines: function(text, limit)
    {
        return Str.cropMultipleLines(text, limit);
    },

    toLowerCase: function(text)
    {
        return text ? text.toLowerCase() : text;
    },

    plural: function(n)
    {
        return n == 1 ? "" : "s";
    }
});

// ********************************************************************************************* //

Reps.Nada = domplate(Reps.Rep,
{
    tag: SPAN(""),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "nada"
});

// ********************************************************************************************* //

Reps.ErrorCopy = function(message)
{
    this.message = message;
};

// ********************************************************************************************* //

return Reps;

// ********************************************************************************************* //
}});
