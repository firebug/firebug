/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/rep",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/console/errorMessageObj",
    "firebug/console/errorMessageRep",
    "firebug/console/errorCopy",
    "firebug/chrome/reps",
    "firebug/js/stackFrame",
],
function(Firebug, Rep, FBTrace, Obj, Domplate, ErrorMessageObj, ErrorMessage, ErrorCopy,
    FirebugReps, StackFrame) {

"use strict"

// ********************************************************************************************* //
// Constants

var {domplate, TAG} = Domplate;

// ********************************************************************************************* //
// Exception Template Implementation

/**
 * @domplate This template represents exceptions that happen in the content and appear
 * within Firebug UI. It's registered as Firebug rep.
 */
var Exception = domplate(Rep,
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
            trace = StackFrame.parseToStackTrace(object.stack, context);
            trace = StackFrame.cleanStackTraceOfFirebug(trace);

            if (!trace)
                lineNo = 0;
        }

        var errorObject = new ErrorMessageObj(message, url, lineNo, "", "js",
            context, trace);

        if (trace && trace.frames && trace.frames[0])
            errorObject.correctWithStackTrace(trace);

        errorObject.resetSource();
        return errorObject;
    },

    supportsObject: function(object, type)
    {
        return (object instanceof ErrorCopy) || Obj.XW_instanceof(object, Error);
    }
});

// ********************************************************************************************* //
// Registration

// xxxHonza: back compatibility
FirebugReps.Except = Exception;

Firebug.registerRep(Exception);

return Exception;

// ********************************************************************************************* //
});
