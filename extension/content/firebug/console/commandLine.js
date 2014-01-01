/* See license.txt for terms of usage */
/*jshint forin:false, noempty:false, esnext:true, es5:true, curly:false */
/*global FBTrace:true, Components:true, define:true, KeyEvent:true */

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/dom",
    "firebug/chrome/firefox",
    "firebug/chrome/window",
    "firebug/lib/system",
    "firebug/lib/string",
    "firebug/lib/persist",
    "firebug/console/console",
    "firebug/console/commandLineExposed",
    "firebug/console/closureInspector",
    "firebug/console/commandLineAPI",
    "firebug/console/autoCompleter",
    "firebug/console/commandHistory",
    "firebug/console/commands/commandLineHelp",
    "firebug/console/commands/commandLineInclude",
],
function(Module, Obj, Firebug, FirebugReps, Locale, Events, Url, Dom, Firefox, Win, System, Str,
    Persist, Console, CommandLineExposed, ClosureInspector, CommandLineAPI) {

"use strict";

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;

const commandPrefix = ">>> ";

// ********************************************************************************************* //
// Command Line

Firebug.CommandLine = Obj.extend(Module,
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
        else if (options == undefined)
            options = {};

        targetWindow = targetWindow || context.getCurrentGlobal();

        var debuggerState, result = null;
        try
        {
            debuggerState = Firebug.Debugger.beginInternalOperation();

            var self = this;
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
                        successConsoleFunction, exceptionFunction, expr);
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
                context.invalidatePanels("dom", "html");
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
        var win = targetWindow || context.getCurrentGlobal();
        options = options || {};

        if (!win)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.evaluateInGlobal: no targetWindow!");
            return;
        }

        context.baseWindow = context.baseWindow || context.window;
        var onSuccess, onError;

        if (successConsoleFunction)
        {
            onSuccess = function(result)
            {
                if (FBTrace.DBG_COMMANDLINE)
                {
                    FBTrace.sysout("commandLine.evaluateInGlobal; the evaluation succeeded "+
                        "and returned: ", result);
                }

                if (Console.isDefaultReturnValue(result))
                    return;

                successConsoleFunction(result, context);
            }
        }

        if (!exceptionFunction)
        {
            exceptionFunction = function(result, context)
            {
                Firebug.Console.logFormatted([result], context, "error", true);
            }
        }

        onError = function(result)
        {
            if (FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.evaluateInGlobal; the evaluation threw "+
                    "an exception:" + result, result);
            }

            exceptionFunction(result, context, "errorMessage");
        };

        origExpr = origExpr || expr;
        CommandLineExposed.evaluate(context, win, expr, origExpr, onSuccess, onError, options);
    },

    evaluateInDebugFrame: function(expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction)
    {
        var result = null;

        if (!context.commandLineAPI)
            context.commandLineAPI = CommandLineAPI.getCommandLineAPI(context);

        var htmlPanel = context.getPanel("html", true);
        var scope = {
            api       : context.commandLineAPI,
            vars      : htmlPanel ? htmlPanel.getInspectorVars() : null,
            thisValue : thisValue
        };

        try
        {
            result = Firebug.Debugger.evaluate(expr, context, scope);

            successConsoleFunction(result, context);
        }
        catch (e)
        {
            exceptionFunction(e, context);
        }

        return result;
    },

    evaluateInWebPage: function(expr, context, targetWindow)
    {
        var win = targetWindow || context.getCurrentGlobal();

        var element = Dom.addScript(win.document, "_firebugInWebPage", expr);
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

        if (!Firebug.commandEditor || context.panelName !== "console")
        {
            this.clear(context);
            Firebug.Console.log(commandPrefix + expr, context, "command", FirebugReps.Text);
        }
        else
        {
            var shortExpr = Str.cropString(Str.stripNewLines(expr), 100);
            Firebug.Console.log(commandPrefix + shortExpr, context, "command",
                FirebugReps.Text);
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

    focus: function(context)
    {
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
            if (Firebug.commandEditor)
                commandLine.focus();
            else if (commandLine.getAttribute("focused") !== "true")
                setTimeout(function() { commandLine.select(); });
        }
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

        Dom.collapse(chrome.$("fbCommandBox"), multiLine);
        Dom.collapse(chrome.$("fbPanelSplitter"), !multiLine);
        Dom.collapse(chrome.$("fbSidePanelDeck"), !multiLine);

        if (multiLine)
            chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbCommandEditorBox");

        var commandLine = this.getSingleRowCommandLine();
        var commandEditor = this.getCommandEditor();

        // we are just closing the view
        if (saveMultiLine)
        {
            commandLine.value = commandEditor.value;
            return;
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

    toggleMultiLine: function(forceCommandEditor)
    {
        var showCommandEditor = !!forceCommandEditor || !Firebug.commandEditor;
        if (showCommandEditor != Firebug.commandEditor)
            Firebug.Options.set("commandEditor", showCommandEditor);
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
                Firebug.Options.set("commandEditor", true);

                // Switch to the Console panel, where the multiline command line
                // is actually displayed. This should be improved see issue 5146
                Firebug.chrome.selectPanel("console");
            }, this));
        }
    },

    onCommandLineOverflow: function(event)
    {
        this.checkOverflow(Firebug.currentContext);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        this.setAutoCompleter();
        this.commandHistory = new Firebug.CommandHistory();

        if (Firebug.commandEditor)
            this.setMultiLine(true, Firebug.chrome);
    },

    // (Re)create the auto-completer for the small command line.
    setAutoCompleter: function()
    {
        if (this.autoCompleter)
            this.autoCompleter.shutdown();

        var commandLine = this.getSingleRowCommandLine();
        var completionBox = this.getCompletionBox();

        var options = {
            showCompletionPopup: Firebug.Options.get("commandLineShowCompleterPopup"),
            completionPopup: Firebug.chrome.$("fbCommandLineCompletionList"),
            popupMeasurer: Firebug.chrome.$("fbCommandLineMeasurer"),
            tabWarnings: true,
            includeCurrentScope: true,
            includeCommandLineAPI: true
        };

        this.autoCompleter = new Firebug.JSAutoCompleter(commandLine, completionBox, options);
    },

    initializeUI: function()
    {
        this.onCommandLineInput = Obj.bind(this.onCommandLineInput, this);
        this.onCommandLineOverflow = Obj.bind(this.onCommandLineOverflow, this);
        this.onCommandLineKeyUp = Obj.bind(this.onCommandLineKeyUp, this);
        this.onCommandLineKeyDown = Obj.bind(this.onCommandLineKeyDown, this);
        this.onCommandLineKeyPress = Obj.bind(this.onCommandLineKeyPress, this);
        this.attachListeners();
    },

    attachListeners: function()
    {
        var commandLine = this.getSingleRowCommandLine();

        Events.addEventListener(commandLine, "input", this.onCommandLineInput, true);
        Events.addEventListener(commandLine, "overflow", this.onCommandLineOverflow, true);
        Events.addEventListener(commandLine, "keyup", this.onCommandLineKeyUp, true);
        Events.addEventListener(commandLine, "keydown", this.onCommandLineKeyDown, true);
        Events.addEventListener(commandLine, "keypress", this.onCommandLineKeyPress, true);
    },

    shutdown: function()
    {
        var commandLine = this.getSingleRowCommandLine();

        if (this.autoCompleter)
            this.autoCompleter.shutdown();

        if (this.commandHistory)
            this.commandHistory.detachListeners();

        Events.removeEventListener(commandLine, "input", this.onCommandLineInput, true);
        Events.removeEventListener(commandLine, "overflow", this.onCommandLineOverflow, true);
        Events.removeEventListener(commandLine, "keyup", this.onCommandLineKeyUp, true);
        Events.removeEventListener(commandLine, "keydown", this.onCommandLineKeyDown, true);
        Events.removeEventListener(commandLine, "keypress", this.onCommandLineKeyPress, true);
    },

    destroyContext: function(context, persistedState)
    {
        var panelState = Persist.getPersistedState(this, "console");
        panelState.commandLineText = context.commandLineText;

        var commandLine = this.getCommandLine(context);
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
            case KeyEvent.DOM_VK_ENTER:
                event.preventDefault();

                if (!event.metaKey && !event.shiftKey)
                {
                    Firebug.CommandLine.enter(Firebug.currentContext);
                    this.commandHistory.hide();
                    return true;
                }
                else if(!event.metaKey && event.shiftKey)
                {
                    Firebug.CommandLine.enterInspect(Firebug.currentContext);
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
                if (Firebug.CommandLine.cancel(Firebug.currentContext))
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
        return (!this.isInOtherPanel(context) && Firebug.commandEditor) ?
            this.getCommandEditor():
            this.getSingleRowCommandLine();
    },

    isInOtherPanel: function(context)
    {
        // Command line on other panels is never multiline.
        var visible = Firebug.CommandLine.Popup.isVisible();
        return visible && context.panelName !== "console";
    },

    getExpression: function(context)
    {
        return (!this.isInOtherPanel(context) && Firebug.commandEditor) ?
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

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.CommandLine);

return Firebug.CommandLine;

// ********************************************************************************************* //
});
