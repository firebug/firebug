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
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/stack/stackTrace",
],
function(Firebug, Rep, FBTrace, Obj, Domplate, ErrorMessageObj, ErrorMessage, ErrorCopy,
    FirebugReps, StackFrame, StackTrace) {

"use strict"

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

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
        var source = object.source || "";

        var trace;
        if (object.stack)
        {
            trace = StackTrace.parseToStackTrace(object.stack, context);
            trace = StackFrame.removeChromeFrames(trace);

            if (!trace)
                lineNo = 0;
        }

        var errorObject = new ErrorMessageObj(message, url, lineNo, source, "js",
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

// xxxHonza: which one is needed for back compatibility
FirebugReps.ExceptionRep = Exception;
FirebugReps.Except = Exception;

Firebug.registerRep(Exception);

return Exception;

// ********************************************************************************************* //
});
