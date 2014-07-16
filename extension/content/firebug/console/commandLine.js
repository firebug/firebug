/* See license.txt for terms of usage */
/*jshint forin:false, noempty:false, esnext:true, curly:false */
/*global FBTrace:true, Components:true, define:true, KeyEvent:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/dom",
    "firebug/lib/system",
    "firebug/lib/string",
    "firebug/lib/persist",
    "firebug/lib/options",
    "firebug/chrome/module",
    "firebug/chrome/reps",
    "firebug/chrome/firefox",
    "firebug/chrome/window",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/debuggerLib",
    "firebug/console/console",
    "firebug/console/commandLineExposed",
    "firebug/console/closureInspector",
    "firebug/console/commandLineAPI",
    "firebug/console/autoCompleter",
    "firebug/console/commandHistory",
    "firebug/console/commands/commandLineHelp",
    "firebug/console/commands/commandLineInclude",
],
function(Firebug, FBTrace, Obj, Locale, Events, Url, Dom, System, Str, Persist, Options,
    Module, FirebugReps, Firefox, Win, SourceLink, DebuggerLib, Console, CommandLineExposed,
    ClosureInspector, CommandLineAPI) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;

var Trace = FBTrace.to("DBG_COMMANDLINE");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Command Line

/**
 * @module
 */
var CommandLine = Obj.extend(Module,
/** @lends CommandLine */
{
    dispatchName: "commandLine",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Evaluates an expression either in the global scope or in the current scope
     * of the JS debugger, depending on the state of Firebug (i.e. if the debugger is currently
     * active, etc.).
     *
     * @param {string} expr The expression.
     * @param {Context} context The Firebug context.
     * @param {*} [thisValue] Deprecated. Set it to null or undefined.
     * @param {Window} [targetWindow] The window in which the expression is evaluated.
     * @param {function} [successConsoleFunction] The callback function in case of
     *      evaluation without errors.
     * @param {function} [exceptionFunction] The callback function in case of
     *      evaluation with errors.
     * @param {object} [options] The options with the following properties:
     *      - noStateChange: if set to true, do not update the DOM and HTML panels. (default=false)
     *      - noCmdLineAPI: if set to true, do not evaluate with the Firebug commands. (default=false)
     */
    evaluate: function(expr, context, thisValue, targetWindow, successConsoleFunction,
        exceptionFunction, options)
    {
        if (!context)
            return;

        // Previously there was `noStateChange` in place of `options`. For backward compatibility,
        // if `options` is a boolean, its value is meant to be `noStateChange`.
        if (typeof options === "boolean")
            options = {noStateChange: options};
        else if (options == null)
            options = {};

        targetWindow = targetWindow || context.getCurrentGlobal();

        var debuggerState, result = null;
        try
        {
            debuggerState = Firebug.Debugger.beginInternalOperation();

            var evaluate = function(newExpr)
            {
                if (this.isSandbox(context))
                {
                    this.evaluateInSandbox(newExpr, context, thisValue, targetWindow,
                        successConsoleFunction, exceptionFunction, expr);
                }
                else if (Firebug.Debugger.hasValidStack(context))
                {
                    this.evaluateInDebugFrame(newExpr, context, thisValue, targetWindow,
                        successConsoleFunction, exceptionFunction, expr, options);
                }
                else
                {
                    this.evaluateInGlobal(newExpr, context, thisValue, targetWindow,
                        successConsoleFunction, exceptionFunction, expr, options);
                }
            }.bind(this);

            if (options.noCmdLineAPI)
                evaluate(expr);
            else
                ClosureInspector.withExtendedLanguageSyntax(expr, targetWindow, context, evaluate);

            if (!options.noStateChange)
                context.invalidatePanels("dom", "html", "watches");
        }
        catch (exc)
        {
            // XXX jjb, I don't expect this to be taken, the try here is for the finally
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("commandLine.evaluate with context.stopped:" + context.stopped +
                    " EXCEPTION " + exc, exc);
            }
        }
        finally
        {
            Firebug.Debugger.endInternalOperation(debuggerState);
        }
    },

    /**
     * Evaluates an expression in the global scope.
     *
     * @param {string} expr The expression.
     * @param {Context} context The Firebug context.
     * @param {*} [thisValue] Deprecated. Set it to null or undefined.
     * @param {Window} [targetWindow] The window in which the expression is evaluated.
     * @param {function} [successConsoleFunction] The callback function in case of
     *      evaluation without errors.
     * @param {function} [exceptionFunction] The callback function in case of
     *      evaluation with errors.
     * @param {string} [origExpr] The original expression before it has been transformed
     *          (mainly used by ClosureInspector). If not set, origExpr=expr.
     * @param {object} [options] The options with the following properties:
     *      - noCmdLineAPI: if set to true, do not evaluate with the Firebug commands. (default=false)
     */
    evaluateInGlobal: function(expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction, origExpr, options)
    {
        // Setting the execution context type.
        var args = ["global"];
        // Append arguments of this function.
        args.push.apply(args, arguments);

        return evaluateExpression.apply(null, args);
    },

    /**
     * Evaluates an expression in the current frame.
     *
     * @param {string} expr The expression.
     * @param {Context} context The Firebug context.
     * @param {*} [thisValue] Deprecated. Set it to null or undefined.
     * @param {Window} [targetWindow] The window in which the expression is evaluated.
     * @param {function} [successConsoleFunction] The callback function in case of
     *      evaluation without errors.
     * @param {function} [exceptionFunction] The callback function in case of
     *      evaluation with errors.
     * @param {string} [origExpr] The original expression before it has been transformed
     *          (mainly used by ClosureInspector). If not set, origExpr=expr.
     * @param {object} [options] The options with the following properties:
     *      - noCmdLineAPI: if set to true, do not evaluate with the Firebug commands. (default=false)
     */
    evaluateInDebugFrame: function(expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction, origExpr, options)
    {
        // Setting the execution context type.
        var args = ["frame"];
        // Append arguments of this function.
        args.push.apply(args, arguments);

        return evaluateExpression.apply(null, args);
    },

    /**
     * Evaluate an expression in a webpage, inserting a temporary script in it.
     *
     * @param {string} expr The expression
     * @param {object} context
     * @param {Window} [targetWindow] The window in which we evaluate the expression
     */
    evaluateInWebPage: function(expr, context, targetWindow)
    {
        var win = targetWindow || context.getCurrentGlobal();

        Trace.sysout("CommandLine.evaluateInWebPage; expression = " + expr, expr);
        // Dom.addScript checks whether an element with the given ID already exists and returns it
        // when it is the case. But we might have to call evaluateInWebPage multiple times before
        // the setTimeout() callback to remove the element is called. So we generate a unique ID.
        var elementId = "_firebugInWebPage" + Math.random();

        var element = Dom.addScript(win.document, elementId, expr);
        if (!element)
            return;

        setTimeout(function delayRemoveScriptTag()
        {
            // we don't need the script element, result is in DOM object
            if (element.parentNode)
                element.parentNode.removeChild(element);
        });

        return "true";
    },

    // isSandbox(context) true, => context.global is a Sandbox
    evaluateInSandbox: function(expr, context, thisValue, targetWindow, successConsoleFunction,
        exceptionFunction)
    {
        var result,
            scriptToEval = expr;

        try
        {
            result = Components.utils.evalInSandbox(scriptToEval, context.global);

            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.evaluateInSandbox success for sandbox ", scriptToEval);

            successConsoleFunction(result, context);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.evaluateInSandbox FAILED in "+context.getName()+
                    " because "+e, e);

            exceptionFunction(e, context);

            result = new FirebugReps.ErrorMessageObj("commandLine.evaluateInSandbox FAILED: " + e,
                Url.getDataURLForContent(scriptToEval, "FirebugCommandLineEvaluate"),
                e.lineNumber, 0, "js", context, null);
        }

        return result;
    },

    isSandbox: function (context)
    {
        return (context.global && context.global+"" === "[object Sandbox]");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    enter: function(context, command)
    {
        var expr = command ? command : this.getExpression(context);
        if (expr === "")
            return;

        if (!Options.get("commandEditor") || context.panelName !== "console")
        {
            this.clear(context);
            Firebug.Console.log(expr, context, "command", FirebugReps.Command);
        }
        else
        {
            var shortExpr = Str.cropString(Str.stripNewLines(expr), 100);
            Firebug.Console.log(shortExpr, context, "command",
                FirebugReps.Command);
        }

        this.commandHistory.appendToHistory(expr);

        var noscript = getNoScript(), noScriptURI;
        if (noscript)
        {
            var currentURI = Firefox.getCurrentURI();
            noScriptURI = currentURI ? noscript.getSite(currentURI.spec) : null;
            if (noScriptURI)
                noScriptURI = (noscript.jsEnabled || noscript.isJSEnabled(noScriptURI)) ?
                    null : noScriptURI;
        }

        if (noscript && noScriptURI)
            noscript.setJSEnabled(noScriptURI, true);

        var self = this;
        var logResult = Firebug.Console.log.bind(Firebug.Console);

        function successHandler(result, context)
        {
            self.dispatch("expressionEvaluated", [context, expr, result, true]);
            logResult.apply(this, arguments);
        }

        function exceptionHandler(err, context)
        {
            self.dispatch("expressionEvaluated", [context, expr, err, false]);
            logResult.apply(this, arguments);
        }

        // Finally, let's evaluate the use expression!
        this.evaluate(expr, context, null, null, successHandler, exceptionHandler);

        if (noscript && noScriptURI)
            noscript.setJSEnabled(noScriptURI, false);

        var consolePanel = context.getPanel("console");
        if (consolePanel)
            Dom.scrollToBottom(consolePanel.panelNode);
    },

    enterInspect: function(context)
    {
        var expr = this.getCommandLine(context).value;
        if (expr === "")
            return;

        this.clear(context);
        this.commandHistory.appendToHistory(expr);

        this.evaluate(expr, context, null, null, function(result)
        {
            if (typeof result !== "undefined")
                Firebug.chrome.select(result);
        });
    },

    reenter: function(context)
    {
        var command = this.commandHistory.getLastCommand();
        this.enter(context, command);
    },

    copyBookmarklet: function(context)
    {
        // XXXsilin: This needs escaping, and stripNewLines is exactly the
        // wrong thing to do when it comes to JavaScript.
        var commandLine = this.getCommandLine(context);
        var expr = "javascript: " + Str.stripNewLines(commandLine.value);
        System.copyToClipboard(expr);
    },

    focus: function(context, options)
    {
        options = options || {};

        if (Firebug.isDetached())
            Firebug.chrome.focus();
        else
            Firebug.toggleBar(true);

        var commandLine = this.getCommandLine(context);

        if (!context.panelName)
        {
            Firebug.chrome.selectPanel("console");
        }
        else if (context.panelName !== "console")
        {
            this.Popup.toggle(Firebug.currentContext);
            setTimeout(function() { commandLine.select(); });
        }
        else
        {
            // We are already on the console, if the command line has also
            // the focus, toggle back. But only if the UI has been already
            // opened.
            if (!options.select)
                commandLine.focus();
            else
                commandLine.select();
        }
    },

    blur: function(context)
    {
        var commandLine = this.getCommandLine(context);
        commandLine.blur();
    },

    clear: function(context)
    {
        var commandLine = this.getCommandLine(context);

        if (commandLine.value)
        {
            commandLine.value = "";
            this.autoCompleter.hide();
            this.update(context);
            return true;
        }

        return false;
    },

    cancel: function(context)
    {
        return this.clear(context);
    },

    update: function(context)
    {
        var commandLine = this.getCommandLine(context);
        context.commandLineText = commandLine.value;
    },

    // xxxsz: setMultiLine should just be called when switching between Command Line
    // and Command Editor
    // xxxHonza: it is called for me when switching between the Command Line and
    // Command Editor
    setMultiLine: function(multiLine, chrome, saveMultiLine)
    {
        var context = Firebug.currentContext;

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.setMultiline; multiLine: " + multiLine + " for: " +
                (context ? context.getName() : "no contet"));
        }

        if (context && context.panelName !== "console")
            return;

        var commandLine = this.getSingleRowCommandLine();
        var commandEditor = this.getCommandEditor();

        // We are just closing the view.
        if (saveMultiLine)
        {
            // Save the cursor position before switching to another panel,
            // so switching back to the Console panel restores the cursor position (see issue 7273).
            commandEditor.saveCursorLocation();

            commandLine.value = commandEditor.value;

            // Specify that the Command Editor is hidden, so we remove the padding
            // which causes an unresponsive warning (see issue 6824).
            if (commandEditor)
                commandEditor.addOrRemoveClassCommandEditorHidden(true);

            return;
        }

        Dom.collapse(chrome.$("fbCommandBox"), multiLine);
        Dom.collapse(chrome.$("fbPanelSplitter"), !multiLine);
        Dom.collapse(chrome.$("fbSidePanelDeck"), !multiLine);

        if (multiLine)
        {
            if (commandEditor)
                commandEditor.addOrRemoveClassCommandEditorHidden(false);
            chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbCommandEditorBox");
        }

        if (context)
        {
            var text = context.commandLineText || "";
            context.commandLineText = text;

            if (multiLine)
                commandEditor.value = Str.cleanIndentation(text);
            else
                commandLine.value = Str.stripNewLines(text);
        }

        // else we may be hiding a panel while turning Firebug off
    },

    toggleCommandEditor: function(isMultiLine)
    {
        var context = Firebug.currentContext;
        Options.set("commandEditor", isMultiLine);
        Firebug.chrome.focus();
        this.getCommandLine(context).focus();
    },

    checkOverflow: function(context)
    {
        if (!context)
            return;

        var commandLine = this.getCommandLine(context);
        if (commandLine.value.indexOf("\n") >= 0)
        {
            setTimeout(Obj.bindFixed(function()
            {
                Options.set("commandEditor", true);

                // Switch to the Console panel, where the multiline command line
                // is actually displayed. This should be improved see issue 5146
                Firebug.chrome.selectPanel("console");
            }, this));
        }
    },

    onCommandLinePaste: function(event)
    {
        // When pasting mutli-line command (a text including end-of-line characters) into
        // the Command Line make sure the Console panel and Command Editor is selected,
        // see also issue 5146. Also, use timeout since the value is set asynchronously.
        // Switching into the Console panel is done upon "paste" event not "overflow",
        // see issue 7124.
        var context = Firebug.currentContext;
        context.setTimeout(() => this.checkOverflow(context));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    initializeUI: function()
    {
        this.setAutoCompleter();
        this.commandHistory = new Firebug.CommandHistory();

        if (Options.get("commandEditor"))
            this.setMultiLine(true, Firebug.chrome);

        this.onCommandLineInput = Obj.bind(this.onCommandLineInput, this);
        this.onCommandLineKeyUp = Obj.bind(this.onCommandLineKeyUp, this);
        this.onCommandLineKeyDown = Obj.bind(this.onCommandLineKeyDown, this);
        this.onCommandLineKeyPress = Obj.bind(this.onCommandLineKeyPress, this);
        this.onCommandLinePaste = Obj.bind(this.onCommandLinePaste, this);
        this.attachListeners();
    },

    // (Re)create the auto-completer for the small command line.
    setAutoCompleter: function()
    {
        if (this.autoCompleter)
            this.autoCompleter.shutdown();

        var commandLine = this.getSingleRowCommandLine();
        var completionBox = this.getCompletionBox();

        var options = {
            showCompletionPopup: Options.get("commandLineShowCompleterPopup"),
            completionPopup: Firebug.chrome.$("fbCommandLineCompletionList"),
            popupMeasurer: Firebug.chrome.$("fbCommandLineMeasurer"),
            tabWarnings: true,
            includeCurrentScope: true,
            includeCommandLineAPI: true
        };

        this.autoCompleter = new Firebug.JSAutoCompleter(commandLine, completionBox, options);
    },

    attachListeners: function()
    {
        var commandLine = this.getSingleRowCommandLine();

        Events.addEventListener(commandLine, "input", this.onCommandLineInput, true);
        Events.addEventListener(commandLine, "keyup", this.onCommandLineKeyUp, true);
        Events.addEventListener(commandLine, "keydown", this.onCommandLineKeyDown, true);
        Events.addEventListener(commandLine, "keypress", this.onCommandLineKeyPress, true);
        Events.addEventListener(commandLine, "paste", this.onCommandLinePaste, true);
    },

    shutdown: function()
    {
        var commandLine = this.getSingleRowCommandLine();

        if (this.autoCompleter)
            this.autoCompleter.shutdown();

        if (this.commandHistory)
            this.commandHistory.detachListeners();

        Events.removeEventListener(commandLine, "input", this.onCommandLineInput, true);
        Events.removeEventListener(commandLine, "keyup", this.onCommandLineKeyUp, true);
        Events.removeEventListener(commandLine, "keydown", this.onCommandLineKeyDown, true);
        Events.removeEventListener(commandLine, "keypress", this.onCommandLineKeyPress, true);
        Events.removeEventListener(commandLine, "paste", this.onCommandLinePaste, true);
    },

    destroyContext: function(context, persistedState)
    {
        var panelState = Persist.getPersistedState(this, "console");
        panelState.commandLineText = context.commandLineText;

        // Clean up the Command Line (the input field it's shared among all contexts)
        // only if this context is the currently displayed one. See also issue 7060.
        var commandLine = this.getCommandLine(context);
        if (context === Firebug.currentContext)
            commandLine.value = "";

        this.autoCompleter.hide();
        Persist.persistObjects(this, panelState);
        // more of our work is done in the Console

        // All command line handlers should be removed at this moment.
        for (var handler in context.activeCommandLineHandlers)
        {
            FBTrace.sysout("commandLine.destroyContext; ERROR active commandlinehandler for: " +
                context.getName());
        }
    },

    showPanel: function(browser, panel)
    {
        var context = Firebug.currentContext;
        if (!context)
            return;

        // Warn that FireClosure is integrated and will conflict.
        if (Firebug.JSAutoCompleter && Firebug.JSAutoCompleter.transformScopeExpr &&
            !this.hasWarnedAboutFireClosure)
        {
            this.hasWarnedAboutFireClosure = true;
            // Use English because this only reaches ~200 users anyway.
            var msg = "FireClosure has been integrated into Firebug. To avoid conflicts, please" +
                " uninstall it and restart your browser.";
            Firebug.Console.logFormatted([msg], context, "warn");
        }

        var panelState = Persist.getPersistedState(this, "console");
        if (panelState.commandLineText)
        {
            var value = panelState.commandLineText;
            var commandLine = this.getCommandLine(browser);
            context.commandLineText = value;

            commandLine.value = value;

            // We don't need the persistent value in this session/context any more. The showPanel
            // method is called every time the panel is selected and the text could have been
            // changed in this session/context already.
            delete panelState.commandLineText;
        }

        this.autoCompleter.hide();
    },

    updateOption: function(name, value)
    {
        if (name === "commandEditor")
            this.setMultiLine(value, Firebug.chrome);
        else if (name === "commandLineShowCompleterPopup")
            this.setAutoCompleter();
    },

    onCommandLineKeyUp: function(event)
    {
    },

    onCommandLineKeyDown: function(event)
    {
        var context = Firebug.currentContext;

        this.autoCompleter.handleKeyDown(event, context);

        if (event.keyCode === KeyEvent.DOM_VK_H && Events.isControl(event))
        {
            event.preventDefault();
            this.autoCompleter.hide();
            this.commandHistory.show(Firebug.chrome.$("fbCommandLineHistoryButton"));
            return true;
        }

        // Parts of the code moved into key-press handler due to bug 613752
    },

    onCommandLineKeyPress: function(event)
    {
        var context = Firebug.currentContext;

        if (!this.autoCompleter.handleKeyPress(event, context))
        {
            this.handleKeyPress(event);
        }
    },

    handleKeyPress: function(event)
    {
        switch (event.keyCode)
        {
            case KeyEvent.DOM_VK_RETURN:
                event.preventDefault();

                if (!event.metaKey && !event.shiftKey)
                {
                    CommandLine.enter(Firebug.currentContext);
                    this.commandHistory.hide();
                    return true;
                }
                else if(!event.metaKey && event.shiftKey)
                {
                    CommandLine.enterInspect(Firebug.currentContext);
                    this.commandHistory.hide();
                    return true;
                }
                break;

            case KeyEvent.DOM_VK_UP:
                event.preventDefault();
                this.commandHistory.cycleCommands(Firebug.currentContext, -1);
                return true;

            case KeyEvent.DOM_VK_DOWN:
                event.preventDefault();
                this.commandHistory.cycleCommands(Firebug.currentContext, 1);
                return true;

            case KeyEvent.DOM_VK_ESCAPE:
                event.preventDefault();
                if (CommandLine.cancel(Firebug.currentContext))
                    Events.cancelEvent(event);
                this.commandHistory.hide();
                return true;
        }

        if (this.commandHistory.isOpen && !event.metaKey && !event.ctrlKey && !event.altKey)
            this.commandHistory.hide();

        return false;
    },

    onCommandLineInput: function(event)
    {
        var context = Firebug.currentContext;

        this.autoCompleter.complete(context);
        this.update(context);
    },

    getCommandLine: function(context)
    {
        return (!this.isInOtherPanel(context) && Options.get("commandEditor")) ?
            this.getCommandEditor():
            this.getSingleRowCommandLine();
    },

    isInOtherPanel: function(context)
    {
        // Command line on other panels is never multiline.
        var visible = CommandLine.Popup.isVisible();
        return visible && context.panelName !== "console";
    },

    getExpression: function(context)
    {
        return (!this.isInOtherPanel(context) && Options.get("commandEditor")) ?
            this.getCommandEditor().getExpression() :
            this.getSingleRowCommandLine().value;
    },

    getCompletionBox: function()
    {
        return Firebug.chrome.$("fbCommandLineCompletion");
    },

    getSingleRowCommandLine: function()
    {
        return Firebug.chrome.$("fbCommandLine");
    },

    getCommandEditor: function()
    {
        return Firebug.CommandEditor;
    }
});

// ********************************************************************************************* //
// Helpers

var getNoScript = function()
{
    // The wrappedJSObject here is not a security wrapper, it is a property set by the service.
    var noscript = Cc["@maone.net/noscript-service;1"] &&
        Cc["@maone.net/noscript-service;1"].getService().wrappedJSObject;
    getNoScript = function()
    {
        return noscript;
    };
    return noscript;
};

function evaluateExpression(execContextType, expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction, origExpr, options)
{
    var win = targetWindow || context.getCurrentGlobal();
    options = options || {};

    if (!win)
    {
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.evaluateExpression: no targetWindow!");
        return;
    }

    var onSuccess, onError;

    if (successConsoleFunction)
    {
        onSuccess = function(result)
        {
            if (FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.evaluateExpression; the evaluation succeeded "+
                    "and returned: ", result);
            }

            if (Console.isDefaultReturnValue(result))
                return;

            successConsoleFunction.apply(null, arguments);
        };
    }

    if (!exceptionFunction)
    {
        exceptionFunction = function(result, context)
        {
            Firebug.Console.logFormatted([result], context, "error", true);
        };
    }

    onError = function(result)
    {
        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.evaluateExpression; the evaluation threw "+
                "an exception:" + result, result);
        }

        exceptionFunction(result, context, "errorMessage");
    };

    origExpr = origExpr || expr;

    if (execContextType === "frame")
    {
        var frame = DebuggerLib.getCurrentFrame(context);
        if (!frame)
        {
            TraceError.sysout("CommandLine.evaluate; frame not found");
            return;
        }

        CommandLineExposed.evaluateInFrame(frame, context, win, expr, origExpr,
            onSuccess, onError, options);
    }
    else if (execContextType === "global")
    {
        CommandLineExposed.evaluate(context, win, expr, origExpr, onSuccess, onError, options);
    }
    else
    {
        throw "CommandLineExposed.evaluateExpression; Invalid value for execContextType";
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(CommandLine);

// xxxHonza: backward compatibility.
Firebug.CommandLine = CommandLine;

return CommandLine;

// ********************************************************************************************* //
});
