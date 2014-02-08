/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/debugger/stack/stackTrace",
    "firebug/debugger/stack/stackFrameRep",
],
function(Obj, Arr, Str, Locale, Firebug, Domplate, StackTrace, StackFrameRep) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, TR} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// StackTrace Rep

var StackTraceRep = domplate(Firebug.Rep,
{
    inspectable: false,

    tag:
        DIV({role: "group", "aria-label": Locale.$STR("aria.labels.stack_trace")},
            FOR("frame", "$object.frames|frameIterator",
                TAG(StackFrameRep.tag, {object: "$frame"})
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "stackTrace",

    supportsObject: function(object, type)
    {
        return object instanceof StackTrace;
    },

    frameIterator: function(frames)
    {
        // Skip Firebug internal frames.
        // xxxHonza: this is anoter place where stack frame is peeling off.
        var result = [];
        for (var i=0; frames && i<frames.length; i++)
        {
            var frame = frames[i];
            var sf = frame.sourceFile;
            if (sf && sf.href && sf.href.startsWith("chrome:"))
                continue;

            result.push(frames[i]);
        }
        return result;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(StackTraceRep);

return StackTraceRep;

// ********************************************************************************************* //
});
