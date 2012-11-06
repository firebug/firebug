/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/chrome/firefox",
    "firebug/chrome/window",
    "firebug/lib/system",
    "firebug/lib/xpath",
    "firebug/lib/string",
    "firebug/lib/xml",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/lib/keywords",
    "firebug/console/console",
    "firebug/console/commandLineHelp",
    "firebug/console/commandLineInclude",
    "firebug/console/commandLineExposed",
    "firebug/console/autoCompleter",
    "firebug/console/commandHistory"
],
function(Obj, Firebug, FirebugReps, Locale, Events, Wrapper, Url, Css, Dom, Firefox, Win, System,
    Xpath, Str, Xml, Arr, Persist, Keywords, Console, CommandLineHelp,
    CommandLineInclude, CommandLineExposed) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const commandPrefix = ">>>";
const reCmdSource = /^with\(_FirebugCommandLine\){(.*)};$/;

// ********************************************************************************************* //
// Command Line

Firebug.CommandLine = Obj.extend(Firebug.Module,
{
    dispatchName: "commandLine",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // targetWindow was needed by evaluateInSandbox, let's leave it for a while in case
    // we rethink this yet again
    initializeCommandLineIfNeeded: function (context, win)
    {
        if (!context || !win)
            return;

        // The command-line requires that the console has been initialized first,
        // so make sure that's so.  This call should have no effect if the console
        // is already initialized.
        var consoleIsReady = Firebug.Console.isReadyElsePreparing(context, win);

        // Make sure the command-line is initialized.  This call should have no
        // effect if the command-line is already initialized.
        var commandLineIsReady = Firebug.CommandLine.isReadyElsePreparing(context, win);

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.initializeCommandLineIfNeeded console ready: " +
                consoleIsReady + " commandLine ready: " + commandLineIsReady);
        }
    },

    // returns user-level wrapped object I guess.
    evaluate: function(expr, context, thisValue, targetWindow, successConsoleFunction,
        exceptionFunction, noStateChange)
    {
        if (!context)
            return;

        try
        {
            var result = null;
            var debuggerState = Firebug.Debugger.beginInternalOperation();

            if (this.isSandbox(context))
            {
                result = this.evaluateInSandbox(expr, context, thisValue, targetWindow,
                    successConsoleFunction, exceptionFunction);
            }
            else if (Firebug.Debugger.hasValidStack(context))
            {
                result = this.evaluateInDebugFrame(expr, context, thisValue, targetWindow,
                    successConsoleFunction, exceptionFunction);
            }
            else
            {
                result = this.evaluateByEventPassing(expr, context, thisValue, targetWindow,
                    successConsoleFunction, exceptionFunction);
            }

            if (!noStateChange)
                context.invalidatePanels("dom", "html");
        }
        catch (exc)
        {
            // XXX jjb, I don't expect this to be taken, the try here is for the finally
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.evaluate with context.stopped:" + context.stopped +
                    " EXCEPTION " + exc, exc);
            }
        }
        finally
        {
            Firebug.Debugger.endInternalOperation(debuggerState);
        }

        return result;
    },

    evaluateByEventPassing: function(expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction)
    {
        var win = targetWindow ? targetWindow :
            (context.baseWindow ? context.baseWindow : context.window);

        if (!win)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.evaluateByEventPassing: no targetWindow!");
            return;
        }

        //xxxHonza: do not detach the command line here. In case where Firebug is 
        // halted in the debugger and debugging a function executed in the command line
        // the command line handler needs to be yet used to display the return value.

        // Inject commandLine APIs again.
        this.initializeCommandLineIfNeeded(context, win);

        // Make sure the command line script is attached.
        if (!Firebug.CommandLine.isAttached(context, win))
        {
            FBTrace.sysout("commandLine: document does not have command line attached " +
                "it's too early for command line "+Win.getWindowId(win)+" location:"+
                Win.safeGetWindowLocation(win), document);

            if (Xml.isXMLPrettyPrint(context, win))
            {
                var msg = Locale.$STR("commandline.disabledForXMLDocs");
                var row = Firebug.Console.logFormatted([msg], context, "warn", true);
                var objectBox = row.querySelector(".objectBox");

                // Log a message with a clickable link that can be used to enable
                // the command line - but the page will switch into HTML. The listener
                // passed into the function is called when the user clicks the link.
                FirebugReps.Description.render(msg, objectBox, Obj.bind(function()
                {
                    // Reset the flag that protect script injection into the page.
                    context.isXMLPrettyPrint = false;

                    // Now inject the command line.
                    Firebug.CommandLine.initializeCommandLineIfNeeded(context, win);
                }, this));
            }
            else
            {
                Firebug.Console.logFormatted(["Firebug cannot find firebug-CommandLineAttached " +
                    "through document.getUserData, it is too early for command line",
                     win], context, "error", true);
            }
            return;
        }

        var event = document.createEvent("Events");
        event.initEvent("firebugCommandLine", true, false);
        win.document.setUserData("firebug-methodName", "evaluate", null);

        expr = expr.toString();
        expr = "with(_FirebugCommandLine){\n" + expr + "\n};";
        win.document.setUserData("firebug-expr", expr, null);

        var consoleHandler = Firebug.Console.injector.getConsoleHandler(context, win);

        if (!consoleHandler)
        {
            FBTrace.sysout("commandLine evaluateByEventPassing no consoleHandler "+
                Win.safeGetWindowLocation(win));
            return;
        }

        if (successConsoleFunction)
        {
            consoleHandler.setEvaluatedCallback( function useConsoleFunction(result)
            {
                var ignoreReturnValue = Console.getDefaultReturnValue(win);
                if (result === ignoreReturnValue)
                    return;

                successConsoleFunction(result, context);
            });
        }

        if (exceptionFunction)
        {
            consoleHandler.setEvaluateErrorCallback(function useExceptionFunction(result)
            {
                exceptionFunction(result, context, "errorMessage");
            });
        }
        else
        {
            consoleHandler.setEvaluateErrorCallback(function useErrorFunction(result)
            {
                if (result)
                {
                    var m = reCmdSource.exec(result.source);
                    if (m && m.length > 0)
                        result.source = m[1];
                }

                Firebug.Console.logFormatted([result], context, "error", true);
            });
        }

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.evaluateByEventPassing '" + expr +
                "' using consoleHandler:", consoleHandler);
        }

        try
        {
            win.document.dispatchEvent(event);

            // Clean up the command line APIs.
            Firebug.CommandLine.injector.detachCommandLine(context, win);
        }
        catch(exc)
        {
            if (FBTrace.DBG_COMMANDLINE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("commandLine.evaluateByEventPassing dispatchEvent FAILS " + exc,
                    {exc:exc, event:event});
        }

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.evaluateByEventPassing return after firebugCommandLine " +
                "event:", event);
        }
    },

    evaluateInDebugFrame: function(expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction)
    {
        var result = null;

        // targetWindow may be frame in HTML
        var win = targetWindow ? targetWindow :
            (context.baseWindow ? context.baseWindow : context.window);

        if (!context.commandLineAPI)
            context.commandLineAPI = new FirebugCommandLineAPI(context);

        var htmlPanel = context.getPanel("html", true);
        var scope = {
            api       : context.commandLineAPI,
            vars      : htmlPanel?htmlPanel.getInspectorVars():null,
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

    evaluateByPostMessage: function(expr, context, thisValue, targetWindow,
        successConsoleFunction, exceptionFunction)
    {
        // targetWindow may be frame in HTML
        var win = targetWindow ? targetWindow :
            (context.baseWindow ? context.baseWindow : context.window);

        if (!win)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.evaluateByPostMessage: no targetWindow!");
            return;
        }

        // We're going to use some command-line facilities, but it may not have initialized yet.
        this.initializeCommandLineIfNeeded(context, win);

        expr = expr.toString();
        expr = "with(_FirebugCommandLine){\n" + expr + "\n};";

        var consoleHandler = Firebug.Console.injector.getConsoleHandler(context, win);

        if (!consoleHandler)
        {
            FBTrace.sysout("commandLine evaluateByPostMessage no consoleHandler "+
                Win.safeGetWindowLocation(win));
            return;
        }

        if (successConsoleFunction)
        {
            consoleHandler.setEvaluatedCallback( function useConsoleFunction(result)
            {
                var ignoreReturnValue = Console.getDefaultReturnValue(win);
                if (result === ignoreReturnValue)
                    return;

                successConsoleFunction(result, context);
            });
        }

        if (exceptionFunction)
        {
            consoleHandler.evaluateError = function useExceptionFunction(result)
            {
                exceptionFunction(result, context, "errorMessage");
            }
        }
        else
        {
            consoleHandler.evaluateError = function useErrorFunction(result)
            {
                if (result)
                {
                    var m = reCmdSource.exec(result.source);
                    if (m && m.length > 0)
                        result.source = m[1];
                }

                Firebug.Console.logFormatted([result], context, "error", true);
            }
        }

        return win.postMessage(expr, "*");
    },

    evaluateInWebPage: function(expr, context, targetWindow)
    {
        var win = targetWindow ? targetWindow :
            (context.baseWindow ? context.baseWindow : context.window);
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
        if (expr == "")
            return;

        var mozJSEnabled = Firebug.Options.getPref("javascript", "enabled");
        if (!mozJSEnabled)
        {
            Firebug.Console.log(Locale.$STR("console.JSDisabledInFirefoxPrefs"), context, "info");
            return;
        }

        if (!Firebug.commandEditor || context.panelName != "console")
        {
            this.clear(context);
            Firebug.Console.log(commandPrefix + " " + expr, context, "command", FirebugReps.Text);
        }
        else
        {
            var shortExpr = Str.cropString(Str.stripNewLines(expr), 100);
            Firebug.Console.log(commandPrefix + " " + shortExpr, context, "command",
                FirebugReps.Text);
        }

        this.commandHistory.appendToHistory(expr);

        var noscript = getNoScript();
        if (noscript)
        {
            var currentURI = Firefox.getCurrentURI();
            var noScriptURI = currentURI ? noscript.getSite(currentURI.spec) : null;
            if (noScriptURI)
                noScriptURI = (noscript.jsEnabled || noscript.isJSEnabled(noScriptURI)) ?
                    null : noScriptURI;
        }

        if (noscript && noScriptURI)
            noscript.setJSEnabled(noScriptURI, true);

        var goodOrBad = Obj.bind(Firebug.Console.log, Firebug.Console);
        this.evaluate(expr, context, null, null, goodOrBad, goodOrBad);

        if (noscript && noScriptURI)
            noscript.setJSEnabled(noScriptURI, false);

        var consolePanel = Firebug.currentContext.panelMap.console;
        if (consolePanel)
            Dom.scrollToBottom(consolePanel.panelNode);
    },

    enterInspect: function(context)
    {
        var expr = this.getCommandLine(context).value;
        if (expr == "")
            return;

        this.clear(context);
        this.commandHistory.appendToHistory(expr);

        this.evaluate(expr, context, null, null, function(result, context)
        {
            if (typeof(result) != undefined)
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
        else if (context.panelName != "console")
        {
            this.Popup.toggle(Firebug.currentContext);
            setTimeout(function() { commandLine.select(); });
        }
        else
        {
            // We are already on the console, if the command line has also
            // the focus, toggle back. But only if the UI has been already
            // opened.
            if (commandLine.getAttribute("focused") != "true")
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

        if (context && context.panelName != "console")
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
        var showCommandEditor = forceCommandEditor || !Firebug.commandEditor;
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
        Firebug.Module.initialize.apply(this, arguments);

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
            includeCurrentScope: true
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
        if (!Firebug.currentContext)
            return;

        var chrome = Firebug.chrome;
        var panelState = Persist.getPersistedState(this, "console");
        if (panelState.commandLineText)
        {
            var value = panelState.commandLineText;
            var commandLine = this.getCommandLine(browser);
            Firebug.currentContext.commandLineText = value;

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
        if (name == "commandEditor")
            this.setMultiLine(value, Firebug.chrome);
        else if (name == "commandLineShowCompleterPopup")
            this.setAutoCompleter();
    },

    // called by users of command line, currently:
    // 1) Console on focus command line,
    // 2) Watch onfocus, and
    // 3) debugger loadedContext if watches exist
    isReadyElsePreparing: function(context, win)
    {
        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.isReadyElsePreparing " + context.getName() + " win: " +
                (win ? win.location : "not given"), context);
        }

        if (this.isSandbox(context))
            return;

        if (Xml.isXMLPrettyPrint(context, win))
            return false;

        if (win)
        {
            Firebug.CommandLine.injector.attachCommandLine(context, win);
        }
        else
        {
            Firebug.CommandLine.injector.attachCommandLine(context, context.window);
            for (var i=0; i<context.windows.length; i++)
                Firebug.CommandLine.injector.attachCommandLine(context, context.windows[i]);
        }

        var contentView = Wrapper.getContentView(context.window);
        if (!contentView)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("CommandLine ERROR context.window invalid", context.window);
            return false;
        }

        // the attach is asynchronous, we can report when it is complete:
        return contentView._FirebugCommandLine;
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

    isAttached: function(context, win)
    {
        if (!context)
            return false;

        return Firebug.CommandLine.injector.isAttached(win ? win : context.window);
    },

    onPanelEnable: function(panelName)
    {
        Dom.collapse(Firebug.chrome.$("fbCommandBox"), true);
        Dom.collapse(Firebug.chrome.$("fbPanelSplitter"), true);
        Dom.collapse(Firebug.chrome.$("fbSidePanelDeck"), true);

        this.setMultiLine(Firebug.commandEditor, Firebug.chrome);
    },

    onPanelDisable: function(panelName)
    {
        if (panelName != "console")  // we don't care about other panels
            return;

        Dom.collapse(Firebug.chrome.$("fbCommandBox"), true);
        Dom.collapse(Firebug.chrome.$("fbPanelSplitter"), true);
        Dom.collapse(Firebug.chrome.$("fbSidePanelDeck"), true);
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
        return visible && context.panelName != "console";
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
// Shared Helpers

Firebug.CommandLine.CommandHandler = Obj.extend(Object,
{
    handle: function(event, api, win)
    {
        var element = event.target;
        var methodName = win.document.getUserData("firebug-methodName");

        // We create this array in the page using JS, so we need to look on the
        // wrappedJSObject for it.
        var contentView = Wrapper.getContentView(win);
        if (contentView)
            var hosed_userObjects = contentView._FirebugCommandLine.userObjects;

        var userObjects = hosed_userObjects ? Arr.cloneArray(hosed_userObjects) : [];

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.CommandHandler for " + Win.getWindowId(win) +
                ": method " + methodName + " userObjects:",  userObjects);

        var subHandler = api[methodName];
        if (!subHandler)
            return false;

        win.document.setUserData("firebug-retValueType", null, null);
        var result = subHandler.apply(api, userObjects);
        if (typeof result != "undefined")
        {
            if (result instanceof window.Array)
            {
                win.document.setUserData("firebug-retValueType", "array", null);
                for (var item in result)
                    hosed_userObjects.push(result[item]);
            }
            else
            {
                hosed_userObjects.push(result);
            }
        }

        return true;
    }
});

// ********************************************************************************************* //
// Command Line API

/**
 * These functions will be called in the extension like this:
 *
 * subHandler.apply(api, userObjects);
 *
 * Where subHandler is one of the entries below, api is this object and userObjects
 * are entries in an array we created in the web page.
 */
function FirebugCommandLineAPI(context)
{
    // returns unwrapped elements from the page
    this.$ = function(selector, start)
    {
        if (start && start.querySelector && (
            start.nodeType == Node.ELEMENT_NODE ||
            start.nodeType == Node.DOCUMENT_NODE ||
            start.nodeType == Node.DOCUMENT_FRAGMENT_NODE))
        {
            return start.querySelector(selector);
        }

        var result = context.baseWindow.document.querySelector(selector);
        if (result == null && (selector || "")[0] !== "#")
        {
            if (context.baseWindow.document.getElementById(selector))
            {
                // This should be removed in the next minor (non-bugfix) version
                var msg = Locale.$STRF("warning.dollar_change", [selector]);
                Firebug.Console.log(msg, context, "warn");
                result = null;
            }
        }

        return result;
    };

    // returns unwrapped elements from the page
    this.$$ = function(selector, start)
    {
        var result;

        if (start && start.querySelectorAll && (
            start.nodeType == Node.ELEMENT_NODE ||
            start.nodeType == Node.DOCUMENT_NODE ||
            start.nodeType == Node.DOCUMENT_FRAGMENT_NODE))
        {
            result = start.querySelectorAll(selector);
        }
        else
        {
            result = context.baseWindow.document.querySelectorAll(selector);
        }

        return Arr.cloneArray(result);
    };

    // returns unwrapped elements from the page
    this.$x = function(xpath, contextNode, resultType)
    {
        var XPathResultType = XPathResult.ANY_TYPE;

        switch (resultType)
        {
            case "number":
                XPathResultType = XPathResult.NUMBER_TYPE;
                break;

            case "string":
                XPathResultType = XPathResult.STRING_TYPE;
                break;

            case "bool":
                XPathResultType = XPathResult.BOOLEAN_TYPE;
                break;

            case "node":
                XPathResultType = XPathResult.FIRST_ORDERED_NODE_TYPE;
                break;

            case "nodes":
                XPathResultType = XPathResult.UNORDERED_NODE_ITERATOR_TYPE;
                break;
        }

        var doc = Wrapper.unwrapObject(context.baseWindow.document);
        return Xpath.evaluateXPath(doc, xpath, contextNode, XPathResultType);
    };

    // values from the extension space
    this.$n = function(index)
    {
        var htmlPanel = context.getPanel("html", true);
        if (!htmlPanel)
            return null;

        if (index < 0 || index >= htmlPanel.inspectorHistory.length)
            return null;

        var node = htmlPanel.inspectorHistory[index];
        if (!node)
            return node;

        return Wrapper.unwrapObject(node);
    };

    this.cd = function(object)
    {
        if (!(object instanceof window.Window))
            throw "Object must be a window.";

        // Make sure the command line is attached into the target iframe.
        var consoleReady = Firebug.Console.isReadyElsePreparing(context, object);
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.cd; console ready: " + consoleReady);

        // The window object parameter uses XPCSafeJSObjectWrapper, but we need XPCNativeWrapper
        // So, look within all registered consoleHandlers for
        // the same window (from tabWatcher) that uses uses XPCNativeWrapper (operator "==" works).
        var entry = Firebug.Console.injector.getConsoleHandler(context, object);
        if (entry)
            context.baseWindow = entry.win;

        var format = Locale.$STR("commandline.CurrentWindow") + " %o";
        Firebug.Console.logFormatted([format, context.baseWindow], context, "info");
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    // no web page interaction
    this.clear = function()
    {
        Firebug.Console.clear(context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    // no web page interaction
    this.inspect = function(obj, panelName)
    {
        Firebug.chrome.select(obj, panelName);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.keys = function(o)
    {
        // the object is from the page, unwrapped
        return Arr.keys(o);
    };

    this.values = function(o)
    {
        // the object is from the page, unwrapped
        return Arr.values(o);
    };

    this.debug = function(fn)
    {
        Firebug.Debugger.monitorFunction(fn, "debug");
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.undebug = function(fn)
    {
        Firebug.Debugger.unmonitorFunction(fn, "debug");
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.monitor = function(fn)
    {
        Firebug.Debugger.monitorFunction(fn, "monitor");
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.unmonitor = function(fn)
    {
        Firebug.Debugger.unmonitorFunction(fn, "monitor");
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.traceAll = function()
    {
        Firebug.Debugger.traceAll(Firebug.currentContext);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.untraceAll = function()
    {
        Firebug.Debugger.untraceAll(Firebug.currentContext);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.traceCalls = function(fn)
    {
        Firebug.Debugger.traceCalls(Firebug.currentContext, fn);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.untraceCalls = function(fn)
    {
        Firebug.Debugger.untraceCalls(Firebug.currentContext, fn);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.copy = function(x)
    {
        System.copyToClipboard(x);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    // xxxHonza: removed from 1.10 (issue 5599)
    /*this.memoryProfile = function(title)
    {
        Firebug.MemoryProfiler.start(context, title);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.memoryProfileEnd = function()
    {
        Firebug.MemoryProfiler.stop(context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };*/

    function createHandler(config, name)
    {
        return function()
        {
            try
            {
                return config.handler.call(null, context, arguments);
            }
            catch (err)
            {
                Firebug.Console.log(err, context, "errorMessage");

                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("commandLine.api; EXCEPTION when executing " +
                        "a command: " + name + ", " + err, err);
                }
            }
        }
    }

    // Register user commands.
    var commands = CommandLineExposed.userCommands;
    for (var name in commands)
    {
        var config = commands[name];
        this[name] = createHandler(config, name);
    }
}

// ********************************************************************************************* //
// CommandLine Injector

Firebug.CommandLine.injector =
{
    isAttached: function(win)
    {
        var contentView = Wrapper.getContentView(win);
        return contentView._FirebugCommandLine ? true : false;
    },

    attachCommandLine: function(context, win)
    {
        win = win ? win : context.window;
        if (win instanceof win.Window)
        {
            // If the command line is already attached then end.
            if (this.isAttached(win))
                return;

            var contentView = Wrapper.getContentView(win);
            contentView._FirebugCommandLine =
                Firebug.CommandLineExposed.createFirebugCommandLine(context, win);

            this.addCommandLineListener(context, win);
        }
        else if (Firebug.CommandLine.isSandbox(context))
        {
            if (FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.injector context.global " + context.global,
                    context.global);
            }
        }
        else
        {
            if (FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.injector, win: " + win +
                    " not a Window or Sandbox", win);
            }
        }
    },

    detachCommandLine: function(context, win)
    {
        win = win ? win : context.window;
        if (this.isAttached(win))
        {
            function failureCallback(result, context)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Firebug.CommandLine.evaluate FAILS  " + result, result);
            }

            //Firebug.CommandLine.evaluate("window._FirebugCommandLine.detachCommandLine()",
            //    context, null, win, null, failureCallback );
            var contentView = Wrapper.getContentView(win);
            contentView._FirebugCommandLine.detachCommandLine();

            this.removeCommandLineListener(context, win);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listener

    addCommandLineListener: function(context, win)
    {
        // Register listener for command-line execution events.
        var handler = new CommandLineHandler(context, win);
        var boundHandler = Obj.bind(handler.handleEvent, handler);

        if (!context.activeCommandLineHandlers)
            context.activeCommandLineHandlers = {};

        var consoleHandler = Firebug.Console.injector.getConsoleHandler(context, win);
        if (!consoleHandler)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.addCommandLineListener; No console handler! " +
                    " Command line listener can't be created." +  context.getName());
            return;
        }

        context.activeCommandLineHandlers[consoleHandler.token] = boundHandler;

        Events.addEventListener(win.document, "firebugExecuteCommand", boundHandler, true);

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.addCommandLineListener to document in window" +
                win.location + " with console ");
        }
    },

    removeCommandLineListener: function(context, win)
    {
        var boundHandler = this.getCommandLineListener(context, win);
        if (boundHandler)
        {
            Events.removeEventListener(win.document, "firebugExecuteCommand", boundHandler, true);

            var consoleHandler = Firebug.Console.injector.getConsoleHandler(context, win);
            delete context.activeCommandLineHandlers[consoleHandler.token];

            if (FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.detachCommandLineListener " + boundHandler +
                    " in window with console " + win.location);
            }
        }
        else
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_COMMANDLINE)
            {
                FBTrace.sysout("commandLine.removeCommandLineListener; ERROR no handler! " +
                    "This could cause memory leaks, please report an issue if you see this. " +
                    context.getName());
            }
        }
    },

    getCommandLineListener: function(context, win)
    {
        if (context.activeCommandLineHandlers)
        {
            var consoleHandler = Firebug.Console.injector.getConsoleHandler(context, win);
            if (consoleHandler)
                return context.activeCommandLineHandlers[consoleHandler.token];

            if (FBTrace.DBG_CONSOLE)
            {
                FBTrace.sysout("getCommandLineListener no consoleHandler for " +
                    context.getName() + " win " + Win.safeGetWindowLocation(win));
            }
        }
    },
};

// ********************************************************************************************* //
// CommandLine Handler

/**
 * This object is responsible for handling commands executing in the page context.
 * When a command (CMD API) is being executed, the page sends a DOM event that is
 * handled by 'handleEvent' method.
 *
 * @param {Object} context
 * @param {Object} win is the window the handler is bound into
 */
function CommandLineHandler(context, win)
{
    this.handleEvent = function(event)
    {
        context.baseWindow = context.baseWindow || context.window;
        this.api = new FirebugCommandLineAPI(context);

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.handleEvent('firebugExecuteCommand') " +
                "event in context.baseWindow " + context.baseWindow.location, event);
        }

        // Appends variables into the api.
        var htmlPanel = context.getPanel("html", true);
        var vars = htmlPanel ? htmlPanel.getInspectorVars() : null;

        for (var prop in vars)
        {
            function createHandler(p)
            {
                return function()
                {
                    if (FBTrace.DBG_COMMANDLINE)
                        FBTrace.sysout("commandLine.getInspectorHistory: " + p, vars);

                    return Wrapper.unwrapObject(vars[p]);
                }
            }

            // XXXjjb should these be removed?
            this.api[prop] = createHandler(prop);
        }

        if (!Firebug.CommandLine.CommandHandler.handle(event, this.api, win))
        {
            var methodName = win.document.getUserData("firebug-methodName");
            Firebug.Console.log(Locale.$STRF("commandline.MethodNotSupported", [methodName]));
        }

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.handleEvent() " +
                win.document.getUserData("firebug-methodName") +
                " context.baseWindow: " +
                (context.baseWindow ? context.baseWindow.location : "no basewindow"),
                context.baseWindow);
        }
    };
}

function getNoScript()
{
    // The wrappedJSObject here is not a security wrapper, it is a property set by the service.
    if (!this.noscript)
        this.noscript = Cc["@maone.net/noscript-service;1"] &&
            Cc["@maone.net/noscript-service;1"].getService().wrappedJSObject;
    return this.noscript;
}


// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.CommandLine);

return Firebug.CommandLine;

// ********************************************************************************************* //
});
