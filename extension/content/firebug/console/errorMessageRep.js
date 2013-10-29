/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/console/errors",
    "firebug/console/errorMessageObj",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/url",
    "firebug/lib/string",
    "firebug/js/sourceLink",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/lib/system",
    "firebug/lib/events",
    "firebug/js/fbs",
    "firebug/chrome/panelActivation",
],
function(Firebug, Module, Rep, FBTrace, Domplate, Errors, ErrorMessageObj, FirebugReps, Locale,
    Url, Str, SourceLink, Dom, Css, Obj, Menu, System, Events, FBS, PanelActivation) {

"use strict"

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var {domplate, TAG, SPAN, DIV, TD, TR, TABLE, TBODY, A, PRE} = Domplate;

// ********************************************************************************************* //
// ErrorMessage Template Implementation

/**
 * @domplate Domplate template used to represent Error logs in the UI. Registered as Firebug rep.
 * This template is used for {@ErrorMessageObj} instances.
 */
var ErrorMessage = domplate(Rep,
/** @lends ErrorMessage */
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
                SPAN({"class": "errorMessage"},
                    "$object.message"
                )
            ),
            DIV({"class": "errorTrace", role: "presentation"}),
            TAG("$object|getObjectsTag", {object: "$object.objects"}),
            DIV({"class": "errorSourceBox errorSource-$object|getSourceType focusRow subLogRow",
                role: "listitem"},
                TABLE({cellspacing: 0, cellpadding: 0},
                    TBODY(
                        TR(
                            TD(
                                SPAN({"class": "$object|isBreakableError a11yFocus",
                                    role: "checkbox", "aria-checked": "$object|hasErrorBreak",
                                    title: Locale.$STR("console.Break On This Error")})
                            ),
                            TD(
                                A({"class": "errorSource a11yFocus"},
                                    PRE({"class": "errorSourceCode",
                                        title: "$object|getSourceTitle"}, "$object|getSource")
                                )
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
        if (!error)
            return false;

        if (error.trace)
            return true;

        // The expand icon is displayed also in case where the actual stack trace
        // isn't available because the debugger (the Script panel) was disabled.
        // In this case, an explanatory message is shown instead.
        if (error.missingTraceBecauseNoDebugger)
            return true;

        return false;
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
        return FBS.hasErrorBreakpoint(Url.normalizeURL(error.href), error.lineNo);
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
            var traceBox = target.getElementsByClassName("errorTrace").item(0);

            Css.toggleClass(target, "opened");
            event.target.setAttribute("aria-expanded", Css.hasClass(target, "opened"));

            if (Css.hasClass(target, "opened"))
            {
                if (target.stackTrace)
                {
                    FirebugReps.StackTrace.tag.append({object: target.stackTrace}, traceBox);
                }
                else if (target.repObject.missingTraceBecauseNoDebugger)
                {
                    this.renderStackTraceMessage(traceBox);
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
    // Stack Trace Message

    renderStackTraceMessage: function(parentNode)
    {
        var hasScriptPanel = PanelActivation.isPanelEnabled("script");
        var type = hasScriptPanel ? "reload" : "enable";
        var clickHandler = this.onClickStackTraceMessage.bind(this, type);
        var msg = (hasScriptPanel ? Locale.$STR("console.DebuggerWasDisabledForError") :
            Locale.$STR("console.ScriptPanelMustBeEnabledForTraces"));

        parentNode.classList.add("message");

        FirebugReps.Description.render(msg, parentNode, clickHandler);
    },

    onClickStackTraceMessage: function(type, event)
    {
        var target = event.target;

        if (type == "enable")
        {
            // Enable the Script panel.
            var scriptPanelType = Firebug.getPanelType("script");
            PanelActivation.enablePanel(scriptPanelType);
        }
        else if (type == "reload")
        {
            var panel = Firebug.getElementPanel(target);
            Firebug.TabWatcher.reloadPageFromMemory(panel.context);
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
        var compilationUnit = context.getCompilationUnit(Url.normalizeURL(error.href));
        if (!compilationUnit)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.breakOnThisError has no source file for error.href: " +
                    error.href + "  error:" + error, context);
            return;
        }

        if (this.hasErrorBreak(error))
            Firebug.Debugger.clearErrorBreakpoint(compilationUnit, error.lineNo);
        else
            Firebug.Debugger.setErrorBreakpoint(compilationUnit, error.lineNo);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof ErrorMessageObj;
    },

    inspectObject: function(error, context)
    {
        var sourceLink = error.getSourceLink();
        FirebugReps.SourceLink.inspectObject(sourceLink, context);
    },

    getContextMenuItems: function(error, target, context)
    {
        var breakOnThisError = this.hasErrorBreak(error);

        var items = [
            {
                label: "CopyError",
                tooltiptext: "console.menu.tip.Copy_Error",
                command: Obj.bindFixed(this.copyError, this, error)
            }
        ];

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
    },
});

// ********************************************************************************************* //
// ErrorMessageUpdater Module

/**
 * @module Responsible for asynchronous UI update or ErrorMessage template.
 */
var ErrorMessageUpdater = Obj.extend(Module,
/** @lends ErrorMessageUpdater */
{
    dispatchName: "ErrorMessageUpdater",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);
        PanelActivation.addListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
        PanelActivation.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // PanelActivation

    activationChanged: function(panelType, enable)
    {
        // The Script panel's activation changed. Make sure all trace messages (for errors)
        // are updated. It must be done for all contexts since panel activation always
        // applies to all contexts.
        if (panelType.prototype.name == "script")
            Firebug.connection.eachContext(this.updateConsolePanel.bind(this));
    },

    updateConsolePanel: function(context)
    {
        var panel = context.getPanel("console", true);
        if (!panel)
            return;

        // Update all existing user messages in the panel.
        var messages = panel.panelNode.querySelectorAll(".errorTrace.message");
        for (var i=0; i<messages.length; i++)
            ErrorMessage.renderStackTraceMessage(messages[i]);
    }
});

// ********************************************************************************************* //
// Registration

// xxxHonza: back compatibility
FirebugReps.ErrorMessage = ErrorMessage;

Firebug.registerModule(ErrorMessageUpdater);
Firebug.registerRep(ErrorMessage);

return ErrorMessage;

// ********************************************************************************************* //
});
