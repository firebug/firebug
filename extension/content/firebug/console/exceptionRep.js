/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/console/errorMessageObj",
    "firebug/console/errorMessageRep",
    "firebug/console/errorCopy",
    "firebug/chrome/reps",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
],
function(Firebug, FBTrace, Obj, Domplate, ErrorMessageObj, ErrorMessage, ErrorCopy,
    FirebugReps, StackFrame, StackTrace) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Exception Template Implementation

/**
 * @domplate
 */
var Exception = domplate(Firebug.Rep,
/** @lends Exception */
{
    tag:
        TAG(ErrorMessage.tag, {object: "$object|getErrorMessage"}),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "exception",

    getTitle: function(object)
    {
        if (object.name)
            return object.name + (object.message ? ": " + object.message : "");

        if (object.message)
            return object.message;

        return "Exception";
    },

    getErrorMessage: function(object)
    {
        var context = Firebug.currentContext;
        var win = context ? context.window : null;

        var url = object.fileName ? object.fileName : (win ? win.location.href : "");
        var lineNo = object.lineNumber ? object.lineNumber : 0;
        var message = this.getTitle(object);

        var trace;
        if (object.stack)
        {
            trace = StackTrace.parseToStackTrace(object.stack, context);
            trace = StackFrame.cleanStackTraceOfFirebug(trace);

            if (!trace)
                lineNo = 0;
        }

        var errorObject = new ErrorMessageObj(message, url, lineNo, null, "js",
            context, trace);

        if (trace && trace.frames && trace.frames[0])
            errorObject.correctWithStackTrace(trace);

        errorObject.resetSource();
        return errorObject;
    },

    supportsObject: function(object, type)
    {
        var str = Object.prototype.toString.call(object);
        return (object instanceof ErrorCopy) || str == "[object Error]";
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(Exception);

return Exception;

// ********************************************************************************************* //
}});
