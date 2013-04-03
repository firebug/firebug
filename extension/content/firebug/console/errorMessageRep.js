/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/console/errors",
    "firebug/console/errorMessageObj",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/url",
    "firebug/lib/string",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/lib/system",
],
function(Firebug, FBTrace, Domplate, Errors, ErrorMessageObj, FirebugReps, Locale, Url, Str,
    SourceLink, Dom, Css, Obj, Menu, System) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// ErrorMessage Template Implementation

var ErrorMessage = domplate(Firebug.Rep,
{
    className: "errorMessage",
    inspectable: false,
    sourceLimit: 80,
    alterText: "...",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tag:
        FirebugReps.OBJECTBOX({
            $hasTwisty: "$object|hasStackTrace",
            $hasBreakSwitch: "$object|hasBreakSwitch",
            $breakForError: "$object|hasErrorBreak",
            _repObject: "$object",
            _stackTrace: "$object|getLastErrorStackTrace",
            onclick: "$onToggleError"},
            DIV({"class": "errorTitle focusRow subLogRow", role: "listitem"},
                SPAN({"class": "errorDuplication"}, "$object.msgId|getDuplication"),
                SPAN({"class": "errorMessage"},
                    "$object.message"
                )
            ),
            DIV({"class": "errorTrace", role: "presentation"}),
            TAG("$object|getObjectsTag", {object: "$object.objects"}),
            DIV({"class": "errorSourceBox errorSource-$object|getSourceType focusRow subLogRow",
                role : "listitem"},
                TABLE({cellspacing: 0, cellpadding: 0},
                    TBODY(
                        TR(
                            TD(
                                IMG({"class": "$object|isBreakableError a11yFocus",
                                    src:"blank.gif", role: "checkbox",
                                    "aria-checked": "$object|hasErrorBreak",
                                    title: Locale.$STR("console.Break On This Error")})
                            ),
                            TD(
                                A({"class": "errorSource a11yFocus"},
                                    PRE({"class": "errorSourceCode",
                                        title: "$object|getSourceTitle"}, "$object|getSource")
                                ),
                                TAG(FirebugReps.SourceLink.tag, {object: "$object|getSourceLink"})
                            )
                        ),
                        TR({$collapsed: "$object|hideErrorCaret"},
                            TD(),
                            TD(
                                DIV({"class": "errorColPosition"},
                                    "$object|getColumnPosition"
                                ),
                                DIV({"class": "errorColCaret"})
                            )
                        )
                    )
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getObjectsTag: function(error)
    {
        return error.objects ? FirebugReps.Arr.tag : SPAN();
    },

    getLastErrorStackTrace: function(error)
    {
        return error.trace;
    },

    hasStackTrace: function(error)
    {
        return error && error.trace;
    },

    hasBreakSwitch: function(error)
    {
        return error.href && error.lineNo > 0;
    },

    isBreakableError: function(error)
    {
        return (error.category === "js") ? "errorBreak" : "errorUnbreakable";
    },

    hasErrorBreak: function(error)
    {
        var url = Url.normalizeURL(error.href);
        var line = error.lineNo - 1;
        return Errors.hasErrorBreakpoint(url, line);
    },

    getDuplication: function(msgId)
    {
        return ""; // filled in later
    },

    getSource: function(error, noCrop)
    {
        if (error.source && noCrop)
        {
            return error.source;
        }
        else if (error.source)
        {
            return Str.cropStringEx(Str.trim(error.source), this.sourceLimit,
                this.alterText, error.colNumber);
        }

        if (error.category == "js" && error.href &&
            error.href.indexOf("XPCSafeJSObjectWrapper") != -1)
        {
            return "";
        }

        var source = error.getSourceLine();
        if (source && noCrop)
        {
            return source;
        }
        else if (source)
        {
            return Str.cropStringEx(Str.trim(source), this.sourceLimit,
                this.alterText, error.colNumber);
        }

        return "";
    },

    hideErrorCaret: function(error)
    {
        var source = this.getSource(error);
        if (!source)
            return true;

        if (typeof(error.colNumber) == "undefined")
            return true;

        return false;
    },

    getColumnPosition: function(error)
    {
        if (this.hideErrorCaret(error))
            return "";

        var colNumber = error.colNumber;
        var originalLength = error.source.length;
        var trimmedLength = Str.trimLeft(error.source).length;

        // The source line is displayed without starting whitespaces.
        colNumber -= (originalLength - trimmedLength);

        var source = this.getSource(error, true);
        if (!source)
            return "";

        source = Str.trim(source);

        // Count how much the pivot needs to be adjusted (based on Str.cropStringEx)
        var halfLimit = this.sourceLimit/2;
        var pivot = error.colNumber;
        if (pivot < halfLimit)
            pivot = halfLimit;

        if (pivot > source.length - halfLimit)
            pivot = source.length - halfLimit;

        // Subtract some columns if the text has been cropped at the beginning.
        var begin = Math.max(0, pivot - halfLimit);
        colNumber -= begin;

        // Add come cols because there is an alterText at the beginning now.
        if (begin > 0)
            colNumber += this.alterText.length;

        var text = "";
        for (var i=0; i<colNumber; i++)
            text += "-";

        return text;
    },

    getSourceTitle: function(error)
    {
        var source = this.getSource(error, true);
        return source ? Str.trim(source) : "";
    },

    getSourceLink: function(error)
    {
        var ext = error.category == "css" ? "css" : "js";
        return error.lineNo ? new SourceLink(error.href, error.lineNo, ext,
            null, null, error.colNumber) : null;
    },

    getSourceType: function(error)
    {
        // Errors occurring inside of HTML event handlers look like "foo.html (line 1)"
        // so let's try to skip those
        if (error.source)
            return "syntax";
        else if (error.category == "css")
            return "show";
        else if (!error.href || !error.lineNo)
            return "none";
        // Why do we have that at all?
        else if (error.lineNo == 1 && Url.getFileExtension(error.href) != "js")
            return "none";
        else
            return "show";
    },

    onToggleError: function(event)
    {
        var target = event.currentTarget;
        if (Css.hasClass(event.target, "errorBreak"))
        {
            var panel = Firebug.getElementPanel(event.target);
            this.breakOnThisError(target.repObject, panel.context);
            return;
        }
        else if (Css.hasClass(event.target, "errorSourceCode"))
        {
            var panel = Firebug.getElementPanel(event.target);
            this.inspectObject(target.repObject, panel.context);
            return;
        }

        var errorTitle = Dom.getAncestorByClass(event.target, "errorTitle");
        if (errorTitle)
        {
            var traceBox = target.childNodes[1];
            Css.toggleClass(target, "opened");
            event.target.setAttribute("aria-expanded", Css.hasClass(target, "opened"));

            if (Css.hasClass(target, "opened"))
            {
                if (target.stackTrace)
                {
                    var rep = Firebug.getRep(target.stackTrace);
                    rep.tag.append({object: target.stackTrace}, traceBox);
                }

                if (Firebug.A11yModel.enabled)
                {
                    var panel = Firebug.getElementPanel(event.target);
                    Events.dispatch(panel.fbListeners, "modifyLogRow", [panel, traceBox]);
                }
            }
            else
            {
                Dom.clearNode(traceBox);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    copyError: function(error)
    {
        var message = [
            error.message,
            error.href,
            "Line " +  error.lineNo
        ];
        System.copyToClipboard(message.join(Str.lineBreak()));
    },

    breakOnThisError: function(error, context)
    {
        var url = Url.normalizeURL(error.href);
        var compilationUnit = context.getCompilationUnit(url);
        if (!compilationUnit)
        {
            TraceError.sysout("reps.breakOnThisError has no source file for error.href: " +
                error.href + "  error:" + error, context);
            return;
        }

        if (this.hasErrorBreak(error))
            Errors.clearErrorBreakpoint(url, error.lineNo - 1);
        else
            Errors.setErrorBreakpoint(context, url, error.lineNo - 1);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof ErrorMessageObj;
    },

    inspectObject: function(error, context)
    {
        var sourceLink = this.getSourceLink(error);
        FirebugReps.SourceLink.inspectObject(sourceLink, context);
    },

    getContextMenuItems: function(error, target, context)
    {
        var breakOnThisError = this.hasErrorBreak(error);

        var items = [{
            label: "CopyError",
            tooltiptext: "console.menu.tip.Copy_Error",
            command: Obj.bindFixed(this.copyError, this, error)
        }];

        if (error.category != "css")
        {
            items.push(
                "-",
                {
                    label: "BreakOnThisError",
                    tooltiptext: "console.menu.tip.Break_On_This_Error",
                    type: "checkbox",
                    checked: breakOnThisError,
                    command: Obj.bindFixed(this.breakOnThisError, this, error, context)
                },
                Menu.optionMenu("BreakOnAllErrors", "breakOnErrors",
                    "console.menu.tip.Break_On_All_Errors")
            );
        }

        return items;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(ErrorMessage);

return ErrorMessage;

// ********************************************************************************************* //
}});
