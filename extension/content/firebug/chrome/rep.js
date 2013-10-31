/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/lib/domplate",
    "firebug/html/inspector",
],
function(Firebug, FBTrace, Locale, Str, Domplate, Inspector) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Implementation

var Rep = Domplate.domplate(
{
    className: "",
    inspectable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return false;
    },

    highlightObject: function(object, context)
    {
        var realObject = this.getRealObject(object, context);
        if (realObject)
            Inspector.highlightObject(realObject, context);
    },

    unhighlightObject: function(object, context)
    {
        Inspector.highlightObject(null);
    },

    inspectObject: function(object, context)
    {
        Firebug.chrome.select(object);
    },

    browseObject: function(object, context)
    {
    },

    persistObject: function(object, context)
    {
    },

    getRealObject: function(object, context)
    {
        return object;
    },

    getTitle: function(object)
    {
        if (!object)
        {
            TraceError.sysout("Rep.getTitle; ERROR No object provided");
            return "null object";
        }

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
            TraceError.sysout("rep.getTitle; EXCEPTION " + e, e);
        }

        var label = Str.safeToString(object); // e.g. [object XPCWrappedNative [object foo]]

        const re =/\[object ([^\]]*)/;
        var m = re.exec(label);
        var n = null;
        if (m)
            n = re.exec(m[1]);  // e.g. XPCWrappedNative [object foo

        if (n)
            return n[1];  // e.g. foo
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
     * @param object: the 'realObject', a model value, e.g. a DOM property
     * @param target: the HTML element clicked on.
     * @param context: the context, probably Firebug.currentContext
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target, context)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Convenience for Domplate templates

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
// Registration

// xxxHonza: backward compatibility
Firebug.Rep = Rep;

return Rep;

// ********************************************************************************************* //
});
