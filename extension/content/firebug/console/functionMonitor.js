/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/js/stackFrame",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/url",
],
function(FBTrace, Obj, Domplate, Reps, StackFrame, Events, Css, Dom, Url) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, A, SPAN, FOR, TAG, DIV} = Domplate;

// ********************************************************************************************* //
// Function Monitor

var FunctionMonitor = Obj.extend(Firebug.Module,
{
    dispatchName: "functionMonitor",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);
        Firebug.connection.addListener(this);
    },

    shutdown: function()
    {
        Firebug.connection.removeListener(this);
        Firebug.Module.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug.Debugger listener

    onMonitorScript: function(context, frame)
    {
        var stackTrace = StackFrame.buildStackTrace(frame);
        Firebug.Console.log(new FunctionLog(frame, stackTrace), context);
    },

    onFunctionCall: function(context, frame, depth, calling)
    {
        //var url = Url.normalizeURL(frame.script.fileName);
        //var sourceFile = context.sourceFileMap[url];
        // Firebug.errorStackTrace = StackFrame.getCorrectedStackTrace(frame, context);
        //var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        if (Url.isSystemURL(Url.normalizeURL(frame.script.fileName)))
            return;

        // xxxHonza: traceCall and traceCallAll need to be fixed yet.
        FBTrace.sysout("functionMonitor.onFunctionCall; ", sourceFile);

        if (calling)
            Firebug.Console.openGroup([frame, "depth:" + depth], context);
        else
            Firebug.Console.closeGroup(context);
    },
});

// ********************************************************************************************* //
// Rep Object

function FunctionLog(frame, stackTrace)
{
    this.frame = frame;
    this.stackTrace = stackTrace;
}

// ********************************************************************************************* //
// Function Monitor Rep

var FunctionMonitorRep = domplate(Firebug.Rep,
{
    className: "functionCall",

    tag:
        Reps.OBJECTBLOCK({$hasTwisty: "$object|hasStackTrace", _repObject: "$object",
            onclick: "$onToggleStackTrace"},
            A({"class": "objectLink functionCallTitle a11yFocus", _repObject: "$object"},
                "$object|getCallName"
            ),
            SPAN("("),
            SPAN({"class": "arguments"},
                FOR("arg", "$object|argIterator",
                    SPAN({"class": "argName"}, "$arg.name"),
                    SPAN("="),
                    TAG("$arg.tag", {object: "$arg.value"}),
                    SPAN({"class": "arrayComma"}, "$arg.delim")
                )
            ),
            SPAN(")"),
            SPAN({"class": "objectLink-sourceLink objectLink a11yFocus",
                _repObject: "$object|getSourceLink",
                role: "link"},
                "$object|getSourceLinkTitle"),
            DIV({"class": "stackTrace"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    hasStackTrace: function(object)
    {
        return true;
    },

    getTitle: function(object)
    {
        return object.frame.getFunctionName();
    },

    getCallName: function(object)
    {
        return this.getTitle(object);
    },

    getSourceLink: function(object)
    {
        return Reps.StackFrame.getSourceLink(object.frame);
    },

    getSourceLinkTitle: function(object)
    {
        return Reps.StackFrame.getSourceLinkTitle(object.frame);
    },

    argIterator: function(object)
    {
        return Reps.StackFrame.argIterator(object.frame);
    },

    onToggleStackTrace: function(event)
    {
        var target = event.originalTarget;

        // Only clicking on the expand button or the function title actually expands
        // the function call log. All other clicks keep default behavior
        if (!(Css.hasClass(target, "objectBox-functionCall") ||
            Css.hasClass(target, "functionCallTitle")))
        {
            return;
        }

        var objectBox = Dom.getAncestorByClass(target, "objectBox-functionCall");
        if (!objectBox)
            return;

        var traceBox = objectBox.getElementsByClassName("stackTrace").item(0);
        Css.toggleClass(traceBox, "opened");

        if (Css.hasClass(traceBox, "opened"))
        {
            var functionCall = objectBox.repObject;
            Reps.StackTrace.tag.append({object: functionCall.stackTrace}, traceBox);
        }
        else
        {
            Dom.clearNode(traceBox);
        }

        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof FunctionLog;
    },

    getRealObject: function(object)
    {
        return object.frame;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(FunctionMonitor);
Firebug.registerRep(FunctionMonitorRep);

return FunctionMonitor;

// ********************************************************************************************* //
});
