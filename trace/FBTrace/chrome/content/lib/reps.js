/* See license.txt for terms of usage */

define([
    "fbtrace/lib/domplate",
    "fbtrace/lib/string",
    "fbtrace/lib/locale",
    "fbtrace/lib/css",
],
function(Domplate, Str, Locale, Css) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var reps = [];
var defaultRep = null;
var defaultFuncRep = null;

// Module
var Reps = {};

// ********************************************************************************************* //
// Common Tags

// use pre here to keep line breaks while copying multiline strings 
var OBJECTBOX = Reps.OBJECTBOX =
    PRE({"class": "objectBox inline objectBox-$className", role: "presentation"});

var OBJECTBLOCK = Reps.OBJECTBLOCK =
    DIV({"class": "objectBox objectBox-$className focusRow subLogRow", role: "listitem"});

var OBJECTLINK = Reps.OBJECTLINK =
    A({
        "class": "objectLink objectLink-$className a11yFocus",
        _repObject: "$object"
    });

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

    getRealObject: function(object, context)
    {
        return object;
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
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target)
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

Reps.Undefined = domplate(Reps.Rep,
{
    tag: OBJECTBOX("undefined"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "undefined",

    supportsObject: function(object, type)
    {
        return type == "undefined";
    }
});

// ********************************************************************************************* //

Reps.Null = domplate(Reps.Rep,
{
    tag: OBJECTBOX("null"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "null",

    supportsObject: function(object, type)
    {
        return object == null;
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

Reps.Number = domplate(Reps.Rep,
{
    tag: OBJECTBOX("$object"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "number",

    supportsObject: function(object, type)
    {
        return type == "boolean" || type == "number";
    }
});

// ********************************************************************************************* //

Reps.String = domplate(Reps.Rep,
{
    tag: OBJECTBOX("&quot;$object&quot;"),

    shortTag: OBJECTBOX("&quot;$object|cropMultipleLines&quot;"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "string",

    supportsObject: function(object, type)
    {
        return type == "string";
    }
});

// ********************************************************************************************* //

Reps.XML = domplate(Reps.Rep,
{
    tag: OBJECTBOX("$object|asString"),

    shortTag: OBJECTBOX("$object|asShortString"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "xml",

    supportsObject: function(object, type)
    {
        return type == "xml";
    },

    asString: function(object)
    {
        return object.toXMLString();
    },

    asShortString: function(object)
    {
        return this.cropMultipleLines(this.asString(object));
    },
});

// ********************************************************************************************* //

Reps.Text = domplate(Reps.Rep,
{
    tag: OBJECTBOX("$object"),

    shortTag: OBJECTBOX("$object|cropMultipleLines"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "text"
});

// ********************************************************************************************* //

Reps.Caption = domplate(Reps.Rep,
{
    tag: SPAN({"class": "caption"}, "$object")
});

// ********************************************************************************************* //

Reps.Func = domplate(Reps.Rep,
{
    tag:
        OBJECTLINK("$object|summarizeFunction"),

    summarizeFunction: function(fn)
    {
        var fnText = Str.safeToString(fn);
        var namedFn = /^function ([^(]+\([^)]*\)) \{/.exec(fnText);
        var anonFn  = /^function \(/.test(fnText);
        var displayName = fn.displayName;

        return namedFn ? namedFn[1] : (displayName ? displayName + "()" :
            (anonFn ? "function()" : fnText));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "function",

    supportsObject: function(object, type)
    {
        return type == "function";
    },

    getTitle: function(fn, context)
    {
        var name = fn.name ? fn.name : "function";
        return name + "()";
    },
});

// ********************************************************************************************* //

Reps.Obj = domplate(Reps.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "objectTitle"}, "$object|getTitle "),
            SPAN({"class": "objectLeftBrace", role: "presentation"}, "{"),
            FOR("prop", "$object|shortPropIterator",
                " $prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            ),
            SPAN({"class": "objectRightBrace"}, "}")
        ),

    shortTag:
        OBJECTLINK(
            SPAN({"class": "objectTitle"}, "$object|getTitle "),
            SPAN({"class": "objectLeftBrace", role: "presentation"}, "{"),
            FOR("prop", "$object|shortPropIterator",
                " $prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            ),
            SPAN({"class": "objectRightBrace"}, "}")
        ),

    titleTag:
        SPAN({"class": "objectTitle"}, "$object|getTitleTag"),

    getTitleTag: function(object)
    {
        var title;
        if (typeof(object) == "string")
            title = object;
        else
            title = this.getTitle(object);

        if (title == "Object")
            title = "{...}";

        return title;
    },

    longPropIterator: function (object)
    {
        return this.propIterator(object, 100);
    },

    shortPropIterator: function (object)
    {
        return this.propIterator(object, 3);
    },

    propIterator: function (object, max)
    {
        var props = [];

        // Object members with non-empty values are preferred since it gives the
        // user a better overview of the object.
        this.getProps(props, object, max, function(t, value)
        {
            return (t == "boolean" || t == "number" || (t == "string" && value) ||
                (t == "object" && value && value.toString));
        });

        if (props.length+1 <= max)
        {
            // There is not enough props yet, let's display also empty members and functions.
            this.getProps(props, object, max, function(t, value)
            {
                return ((t == "string" && !value) || (t == "object" && !value) ||
                    (t == "function"));
            });
        }

        if (props.length > max)
        {
            props[props.length-1] = {
                object: "more...",
                tag: Reps.Caption.tag,
                name: "",
                equal: "",
                delim: ""
            };
        }
        else if (props.length > 0)
        {
            props[props.length-1].delim = '';
        }

        return props;
    },

    getProps: function (props, object, max, filter)
    {
        max = max || 3;
        if (!object)
            return [];

        var len = 0;

        try
        {
            for (var name in object)
            {
                var value;
                try
                {
                    value = object[name];
                }
                catch (exc)
                {
                    continue;
                }

                var t = typeof(value);
                if (filter(t, value))
                {
                    var rep = Reps.getRep(value);
                    var tag = rep.shortTag || rep.tag;
                    if ((t == "object" || t == "function") && value)
                    {
                        value = rep.getTitle(value);
                        if (rep.titleTag)
                            tag = rep.titleTag;
                        else
                            tag = Reps.Obj.titleTag;
                    }

                    if (props.length <= max)
                        props.push({tag: tag, name: name, object: value, equal: "=", delim: ", "});
                    else
                        break;
                }
            }
        }
        catch (exc)
        {
            // Sometimes we get exceptions when trying to read from certain objects, like
            // StorageList, but don't let that gum up the works
            // XXXjjb also History.previous fails because object is a web-page object
            // which does not have permission to read the history
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "object",

    supportsObject: function(object, type)
    {
        return true;
    }
});

// ********************************************************************************************* //

Reps.ErrorCopy = function(message)
{
    this.message = message;
};

// ********************************************************************************************* //
// Public Rep API

Reps.getRep = function(object, context)
{
    var type = typeof(object);
    if (type == "object" && object instanceof String)
        type = "string";

    for (var i = 0; i < reps.length; ++i)
    {
        var rep = reps[i];
        try
        {
            if (rep.supportsObject(object, type))
                return rep;
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("getRep FAILS: "+ exc, exc);
                FBTrace.sysout("getRep reps["+i+"/"+reps.length+"]: "+
                    (typeof(reps[i])), reps[i]);
            }
        }
    }

    return (type == "function") ? defaultFuncRep : defaultRep;
};

Reps.getRepObject = function(node)
{
    var target = null;
    for (var child = node; child; child = child.parentNode)
    {
        if (Css.hasClass(child, "repTarget"))
            target = child;

        if (child.repObject != null)
        {
            if (!target && Css.hasClass(child, "repIgnore"))
                break;
            else
                return child.repObject;
        }
    }
};

Reps.registerRep = function()
{
    reps.push.apply(reps, arguments);
};

Reps.setDefaultReps = function(funcRep, rep)
{
    defaultRep = rep;
    defaultFuncRep = funcRep;
};

// ********************************************************************************************* //
// Registration

Reps.registerRep(
    Reps.Undefined,
    Reps.Null,
    Reps.Number,
    Reps.String,
    Reps.XML
);

Reps.setDefaultReps(Reps.Func, Reps.Obj);

return Reps;

// ********************************************************************************************* //
}});
