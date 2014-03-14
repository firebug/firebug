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
    "firebug/debugger/script/sourceLink",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/lib/system",
    "firebug/lib/events",
    "firebug/chrome/panelActivation",
],
function(Firebug, Module, Rep, FBTrace, Domplate, Errors, ErrorMessageObj, FirebugReps,
    Locale, Url, Str, SourceLink, Dom, Css, Obj, Menu, System, Events, PanelActivation) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var {domplate, TAG, SPAN, DIV, TD, TR, TABLE, TBODY, A, PRE} = Domplate;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_ERRORLOG");

// ********************************************************************************************* //
// ErrorMessage Template Implementation

/**
 * @domplate Domplate template used to represent Error logs in the UI. Registered as Firebug rep.
 * This template is used for {@link ErrorMessageObj} instances.
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
        Rep.tags.OBJECTBOX({
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
        var url = error.href;
        // SourceFile should not use URL fragment (issue 7251)
        //var url = Url.normalizeURL(error.href);

        var line = error.lineNo - 1;
        return Errors.hasErrorBreakpoint(url, line);
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

        // If the source load is currently in-progress, bail out.
        if (error.sourceLoading)
            return "";

        // The source needs to be fetched asynchronously the first time (return value undefined),
        // but if it's already available its being returned synchronously.
        // The UI will be updated upon "onSourceLoaded" event in case when the source needs
        // to be fetched from the server, see {@ErrorMessageUpdater}.
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

        // Add come columns because there is an alterText at the beginning now.
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
        var hasScriptPanel = PanelActivation.isPanelEnabled("script");

        if (!hasScriptPanel)
            return "none";
        else if (error.source)
            return "syntax";
        else if (error.category == "css")
            return "show";
        else if (!error.href || !error.lineNo)
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
                    var rep = Firebug.getRep(target.stackTrace);
                    rep.tag.append({object: target.stackTrace}, traceBox);
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
        var url = error.href;
        // SourceFile should not use URL fragment (issue 7251)
        //var url = Url.normalizeURL(error.href);

        Trace.sysout("errorMessageRep.breakOnThisError; " + url, error);

        var compilationUnit = context.getCompilationUnit(url);
        if (!compilationUnit)
        {
            TraceError.sysout("errorMessageRep.breakOnThisError; ERROR No source file!",
                context);
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
    },
});

// ********************************************************************************************* //
// ErrorMessageUpdater Module

/**
 * @module Responsible for asynchronous UI update or ErrorMessage template.
 *
 * 1) Error logs usually display one line script where the error happened and the source
 *    needs to be fetched asynchronously sometimes.
 *
 * 2) Error logs can also display a breakpoint that can be created or removed, which is
 *    also asynchronous.
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

    initContext: function(context)
    {
        context.getTool("breakpoint").addListener(this);
    },

    destroyContext: function(context)
    {
        context.getTool("breakpoint").removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    onBreakpointAdded: function(context, bp)
    {
        // The Console panel is only interested in error breakpoints.
        if (!bp.isError())
            return;

        Trace.sysout("errorMessageRep.onBreakpointAdded", bp);

        this.updateErrorBreakpoints(context, bp, true);
    },

    onBreakpointRemoved: function(context, bp)
    {
        Trace.sysout("errorMessageRep.onBreakpointRemoved", bp);

        // It isn't possible to check the |bp.type| since the possible error flag has
        // been already removed at this point. See {@BreakpointStore.removeBreakpoint}.
        // So, let's try to remove the breakpoint from the Script panel view in any case.
        this.updateErrorBreakpoints(context, bp, false);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module Events

    onSourceLoaded: function(sourceFile)
    {
        // A new source has been fetched from the server. Let's update existing
        // error logs to make sure they display a source line where the error
        // occurred.
        Events.dispatch(Firebug.modules, "onUpdateErrorObject", [sourceFile]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Error Breakpoint Update

    /**
     * Update Error Breakpoints. Error messages displayed in the Console panel allow
     * creating/removing a breakpoint. Existence of an error-breakpoint is indicated
     * by displaying a red circle before the error description.
     * This method updates the UI if a breakpoint is created/removed.
     * Note that Error messages can be also displayed in the Watch panel (issue 7220).
     *
     * @param {Object} bp Breakpoint instance.
     * @param {Object} isSet If true, an error breakpoint has been added, otherwise false.
     */
    updateErrorBreakpoints: function(context, bp, isSet)
    {
        var messages = [];

        //xxxHonza: we could also use context.invalidatePanels("watches") to
        // update the Watches panel, but this is faster.
        var panels = ["console", "watches"];
        for (var name of panels)
        {
            var panel = context.getPanel(name);
            if (!panel)
                continue;

            var nodes = panel.panelNode.getElementsByClassName("objectBox-errorMessage");
            messages.push.apply(messages, nodes);
        }

        if (!messages.length)
            return;

        Trace.sysout("errorMessageRep.updateErrorBreakpoints; " + messages.length, messages);

        // Iterate all error messages (see firebug/console/errorMessageRep template)
        // in the Console panel and update associated breakpoint UI.
        for (var i=0; i<messages.length; i++)
        {
            var message = messages[i];

            // The repObject associated with an error message template should be always
            // an instance of ErrorMessageObj.
            var error = Firebug.getRepObject(message);
            if (!(error instanceof ErrorMessageObj))
            {
                TraceError.sysout("consolePanel.updateErrorBreakpoints; ERROR Wrong rep object!");
                continue;
            }

            // Errors use real line numbers (1 based) while breakpoints
            // use zero based numbers.
            if (error.href == bp.href && error.lineNo - 1 == bp.lineNo)
            {
                if (isSet)
                    Css.setClass(message, "breakForError");
                else
                    Css.removeClass(message, "breakForError");
            }
        }
    }, 

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Error Source Update

    onUpdateErrorObject: function(sourceFile)
    {
        Trace.sysout("errorMessageRep.onUpdateErrorObject;", errorObject);

        // Get all error-logs in the Console and update the one related to
        // the error-object passed into this method.
        var context = sourceFile.context;
        var panel = context.getPanel("console");

        // The Console panel can be disabled.
        if (!panel)
            return;

        // Look directly for messages not for 'logRow-errorMessage'. In case an exception
        // is logged using console.log() the row is using standard 'logRow-log' class.
        // But in all cases the 'objectBox-errorMessage' class (i.e. the same rep) should be
        // used inside the log.
        var messages = panel.panelNode.querySelectorAll(".objectBox-errorMessage");
        for (var i=0; i<messages.length; i++)
        {
            var message = messages[i];
            var errorObject = Firebug.getRepObject(message);

            if (sourceFile.href == errorObject.href)
            {
                var rep = Firebug.getRep(errorObject, context);
                var content = Dom.getAncestorByClass(message, "logContent");

                // Render content again. The group counter is preserved since it's
                // located outside of the replaced area.
                ErrorMessage.tag.replace({object: errorObject}, content, ErrorMessage);
            }
        }
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
