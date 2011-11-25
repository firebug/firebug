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
    "firebug/firefox/firefox",
    "firebug/firefox/window",
    "firebug/firefox/system",
    "firebug/lib/xpath",
    "firebug/lib/string",
    "firebug/lib/xml",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/console/eventMonitor",
    "firebug/lib/keywords",
    "firebug/console/console",
    "firebug/console/commandLineExposed"
],
function(Obj, Firebug, FirebugReps, Locale, Events, Wrapper, Url, Css, Dom, Firefox, Win, System,
    Xpath, Str, Xml, Arr, Persist, EventMonitor, Keywords, Console) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const commandPrefix = ">>>";

const reOpenBracket = /[\[\(\{]/;
const reCloseBracket = /[\]\)\}]/;
const reJSChar = /[a-zA-Z0-9$_]/;
const reStringExpr = /^" *"$/;
const reLiteralExpr = /^[ "0-9,]*$/;
const reCmdSource = /^with\(_FirebugCommandLine\){(.*)};$/;

// ********************************************************************************************* //
// Globals

// ********************************************************************************************* //

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
        exceptionFunction)
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

        // Detach the commandline API (if attached) to reinitialize it. If e.g.jQuery
        // has been loaded in the meantime, the $ functions shouldn't be overwritten.
        Firebug.CommandLine.injector.detachCommandLine(context, win);

        // Inject commandLine APIs again.
        this.initializeCommandLineIfNeeded(context, win);

        // Make sure the command line script is attached.
        if (!Firebug.CommandLine.isAttached(context, win))
        {
            FBTrace.sysout("commandLine: document does not have command line attached " +
                "its too early for command line "+Win.getWindowId(win)+" location:"+
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
                    "document.getUserData , its too early for command line",
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

                // result will be pass thru this function
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

            // result will be pass thru this function
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

                // result will be pass thru this function
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
        var win = targetWindow || context.window;
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

            // result will be pass thru this function
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

    acceptCompletionOrReturnIt: function(context)
    {
        var commandLine = this.getCommandLine(context);
        if (this.autoCompleter.acceptReturn())
            return commandLine.value; // we have nothing to complete

        this.autoCompleter.acceptCompletion();

        // next time we will return text
        return "";
    },

    enter: function(context, command)
    {
        var expr = command ? command : this.acceptCompletionOrReturnIt(context);
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
    },

    enterMenu: function(context)
    {
        var expr = this.acceptCompletionOrReturnIt(context);
        if (expr == "")
            return;

        this.commandHistory.appendToHistory(expr, true);

        this.evaluate(expr, context, null, null, function(result, context)
        {
            if (typeof(result) != "undefined")
            {
                Firebug.chrome.contextMenuObject = result;

                var popup = Firebug.chrome.$("fbContextMenu");
                var commandLine = this.getCommandLine(context);
                popup.showPopup(commandLine, -1, -1, "popup", "bottomleft", "topleft");
            }
        });
    },

    enterInspect: function(context)
    {
        var expr = this.acceptCompletionOrReturnIt(context);
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
        if (this.autoCompleter.revert(context))
            return;

        return this.clear(context);
    },

    update: function(context)
    {
        var commandLine = this.getCommandLine(context);
        context.commandLineText = commandLine.value;
    },

    // xxxsz: setMultiLine should just be called when switching between Command Line
    // and Command Editor
    setMultiLine: function(multiLine, chrome, saveMultiLine)
    {
        var context = Firebug.currentContext;

        if (context && context.panelName != "console")
            return;

        Dom.collapse(chrome.$("fbCommandBox"), multiLine);
        Dom.collapse(chrome.$("fbPanelSplitter"), !multiLine);
        Dom.collapse(chrome.$("fbSidePanelDeck"), !multiLine);

        if (multiLine)
            chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbCommandEditorBox");

        var commandLine = this.getSingleRowCommandLine();
        var commandEditor = this.getCommandEditor();

        if (saveMultiLine)  // we are just closing the view
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

            this.setAutoCompleter();
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

        this.autoCompleter = new Firebug.EmptyJSAutoCompleter();
        this.commandHistory = new Firebug.CommandLine.CommandHistory();

        if (Firebug.commandEditor)
            this.setMultiLine(true, Firebug.chrome);
    },

    setAutoCompleter: function()
    {
        var context = Firebug.currentContext;

        if (!context || Firebug.commandEditor)
        {
            // xxxHonza: see http://code.google.com/p/fbug/issues/detail?id=4901#c21
            if (this.autoCompleter)
                this.autoCompleter.shutdown();

            this.autoCompleter = new Firebug.EmptyJSAutoCompleter();
        }
        else
        {
            var showCompletionPopup = Firebug.Options.get("commandLineShowCompleterPopup");
            var commandLine = this.getCommandLine(context);
            var completionBox = this.getCompletionBox();

            this.autoCompleter.shutdown();
            this.autoCompleter = new Firebug.JSAutoCompleter(commandLine,
                completionBox, showCompletionPopup);
        }
    },

    initializeUI: function()
    {
        this.onCommandLineFocus = Obj.bind(this.onCommandLineFocus, this);
        this.onCommandLineInput = Obj.bind(this.onCommandLineInput, this);
        this.onCommandLineBlur = Obj.bind(this.onCommandLineBlur, this);
        this.onCommandLineKeyUp = Obj.bind(this.onCommandLineKeyUp, this);
        this.onCommandLineKeyDown = Obj.bind(this.onCommandLineKeyDown, this);
        this.onCommandLineKeyPress = Obj.bind(this.onCommandLineKeyPress, this);
        this.onCommandLineOverflow = Obj.bind(this.onCommandLineOverflow, this);
        this.attachListeners();
    },

    attachListeners: function()
    {
        var commandLine = this.getSingleRowCommandLine();
        var commandEditor = this.getCommandEditor();

        Events.addEventListener(commandEditor, "focus", this.onCommandLineFocus, true);

        Events.addEventListener(commandLine, "focus", this.onCommandLineFocus, true);
        Events.addEventListener(commandLine, "input", this.onCommandLineInput, true);
        Events.addEventListener(commandLine, "overflow", this.onCommandLineOverflow, true);
        Events.addEventListener(commandLine, "keyup", this.onCommandLineKeyUp, true);
        Events.addEventListener(commandLine, "keydown", this.onCommandLineKeyDown, true);
        Events.addEventListener(commandLine, "keypress", this.onCommandLineKeyPress, true);
        Events.addEventListener(commandLine, "blur", this.onCommandLineBlur, true);

        Firebug.Console.addListener(this);  // to get onConsoleInjection
    },

    shutdown: function()
    {
        var commandLine = this.getSingleRowCommandLine();
        var commandEditor = this.getCommandEditor();

        // Make sure all listeners registered by the auto completer are removed.
        if (this.autoCompleter)
            this.autoCompleter.shutdown();

        if (this.commandHistory)
            this.commandHistory.detachListeners();

        Events.removeEventListener(commandEditor, "focus", this.onCommandLineFocus, true);

        Events.removeEventListener(commandLine, "focus", this.onCommandLineFocus, true);
        Events.removeEventListener(commandLine, "input", this.onCommandLineInput, true);
        Events.removeEventListener(commandLine, "overflow", this.onCommandLineOverflow, true);
        Events.removeEventListener(commandLine, "keyup", this.onCommandLineKeyUp, true);
        Events.removeEventListener(commandLine, "keydown", this.onCommandLineKeyDown, true);
        Events.removeEventListener(commandLine, "keypress", this.onCommandLineKeyPress, true);
        Events.removeEventListener(commandLine, "blur", this.onCommandLineBlur, true);
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
            this.handleKeyPress(event);  // independent of completer
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
                    handled = true;
                }
                else if (event.metaKey && !event.shiftKey)
                {
                    Firebug.CommandLine.enterMenu(Firebug.currentContext);
                    handled = true;
                }
                else if(event.shiftKey && !event.metaKey)
                {
                    Firebug.CommandLine.enterInspect(Firebug.currentContext);
                    handled = true;
                }

                if (handled)
                {
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

        return false;
    },

    onCommandLineInput: function(event)
    {
        var context = Firebug.currentContext;

        if (!this.commandHistory.isShown())
        {
            this.autoCompleter.complete(context);
        }

        // Always update the buffer in context, even if command line is empty.
        this.update(context);
    },

    onCommandLineBlur: function(event)
    {
    },

    onCommandLineFocus: function(event)
    {
        // xxxHonza: I think that attaching the command line on focus is wrong.
        // It's done just before executing a command and detached immediatelly
        // after that. All tests pass.
        return;

        var context = Firebug.currentContext;

        if (this.autoCompleter.empty)
            this.setAutoCompleter();

        // Attach the command line API on focus, so it shows up in auto-completion.
        // then there is no currentContext.
        if (!this.attachConsoleOnFocus())
            return;

        if (!Firebug.migrations.commandLineTab)
        {
            var textBox = Firebug.chrome.$("fbCommandLine");
            textBox.value = "";
            textBox.select();
            Firebug.migrations.commandLineTab = true;
        }

        if (!this.isAttached(context))
        {
            return this.isReadyElsePreparing(context);
        }
        else
        {
            if (FBTrace.DBG_COMMANDLINE)
            {
                try
                {
                    var cmdLine = this.isAttached(context);
                    FBTrace.sysout("commandLine.onCommandLineFocus, attachCommandLine " +
                        cmdLine, cmdLine);
                }
                catch (e)
                {
                    FBTrace.sysout("commandLine.onCommandLineFocus, " +
                        "did NOT attachCommandLine ", e);
                }
            }

            return true; // is attached.
        }
    },

    isAttached: function(context, win)
    {
        if (!context)
            return false;

        return Firebug.CommandLine.injector.isAttached(win ? win : context.window);
    },

    attachConsoleOnFocus: function()
    {
        if (!Firebug.currentContext)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.attachConsoleOnFocus no Firebug.currentContext");
            return false;
        }

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.attachConsoleOnFocus: Firebug.currentContext is " +
                Firebug.currentContext.getName() + " in window " + window.location);

        // User has decided to use the command line, but the web page may not have the console
        // if the page has no javascript
        if (Firebug.Console.isReadyElsePreparing(Firebug.currentContext))
        {
            // the page had _firebug so we know that consoleInjected.js compiled and ran.
            if (FBTrace.DBG_COMMANDLINE)
            {
                if (Firebug.currentContext)
                {
                    FBTrace.sysout("commandLine.attachConsoleOnFocus: " +
                        Firebug.currentContext.getName());
                }
                else
                {
                    FBTrace.sysout("commandLine.attachConsoleOnFocus: No Firebug.currentContext");
                }
            }
        }
        return true;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug.Console listener

    onConsoleInjected: function(context, win)
    {
        // for some reason the console has been injected. If the user had focus in the command
        // line they want it added in the page also. If the user has the cursor in the command
        // line and reloads, the focus will already be there. issue 1339
        var isFocused = (this.getCommandEditor().getAttribute("focused") == "true");
        isFocused = isFocused || (this.getSingleRowCommandLine().getAttribute("focused") == "true");
        if (isFocused)
            setTimeout(this.onCommandLineFocus);
    },

    getCommandLine: function(context)
    {
        // Command line on other panels is never multiline.
        var visible = Firebug.CommandLine.Popup.isVisible();
        if (visible && context.panelName != "console")
            return this.getSingleRowCommandLine();

        return Firebug.commandEditor
            ? this.getCommandEditor()
            : this.getSingleRowCommandLine();
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
        return Firebug.chrome.$("fbCommandEditor");
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

// ********************************************************************************************** //
// JavaScript auto-completion

Firebug.JSAutoCompleter = function(textBox, completionBox, showCompletionPopup)
{
    this.textBox = textBox;
    this.completionBox = completionBox;
    this.showCompletionPopup = showCompletionPopup;

    this.completionBase = {
        pre: null,
        expr: null,
        candidates: []
    };
    this.completions = null;

    this.revertValue = null;

    this.completionPopup = Firebug.chrome.$("fbCommandLineCompletionList");
    this.selectedPopupElement = null;

    /**
     * If a completion was just performed, revert it. Otherwise do nothing.
     * Returns true iff the completion was reverted.
     */
    this.revert = function(context)
    {
        if (this.revertValue === null)
            return false;

        this.textBox.value = this.revertValue;
        var len = this.textBox.value.length;
        setCursorToEOL(this.textBox);

        this.complete(context);
        return true;
    };

    /**
     * Hide completions temporarily, so they show up again on the next key press.
     */
    this.hide = function()
    {
        this.completionBase = {
            pre: null,
            expr: null,
            candidates: []
        };
        this.completions = null;

        this.showCompletions();
    };

    /**
     * Hide completions for this expression (/completion base). Appending further
     * characters to the variable name will not make completions appear, but
     * adding, say, a semicolon and typing something else will.
     */
    this.hideForExpression = function()
    {
        this.completionBase.candidates = [];
        this.completions = null;

        this.showCompletions();
    };

    /**
     * Check whether it would be acceptable for the return key to evaluate the
     * expression instead of completing things.
     */
    this.acceptReturn = function()
    {
        if (!this.completions)
            return true;

        if (this.getCompletionBoxValue() === this.textBox.value)
        {
            // The user wouldn't see a difference if we completed. This can
            // happen for example if you type 'alert' and press enter,
            // regardless of whether or not there exist other completions.
            return true;
        }

        return false;
    };

    /**
     * Show completions for the current contents of the text box. Either this or
     * hide() must be called when the contents change.
     */
    this.complete = function(context)
    {
        this.revertValue = null;
        this.createCandidates(context);
        this.showCompletions();
    };

    /**
     * Update the completion base and create completion candidates for the
     * current value of the text box.
     */
    this.createCandidates = function(context)
    {
        var offset = this.textBox.selectionStart;
        if (offset !== this.textBox.value.length)
        {
            this.hide();
            return;
        }

        var value = this.textBox.value;

        // Create a simplified expression by redacting contents/normalizing
        // delimiters of strings and regexes, to make parsing easier.
        // Give up if the syntax is too weird.
        var svalue = simplifyExpr(value);
        if (svalue === null)
        {
            this.hide();
            return;
        }

        if (killCompletions(svalue, value))
        {
            this.hide();
            return;
        }

        // Find the expression to be completed.
        var parseStart = getExpressionOffset(svalue);
        var parsed = value.substr(parseStart);
        var sparsed = svalue.substr(parseStart);

        // Find which part of it represents the property access.
        var propertyStart = getPropertyOffset(sparsed);
        var prop = parsed.substring(propertyStart);
        var spreExpr = sparsed.substr(0, propertyStart);
        var preExpr = parsed.substr(0, propertyStart);

        this.completionBase.pre = value.substr(0, parseStart);

        if (FBTrace.DBG_COMMANDLINE)
        {
            var sep = (parsed.indexOf("|") > -1) ? "^" : "|";
            FBTrace.sysout("Completing: " + this.completionBase.pre + sep + preExpr + sep + prop);
        }

        // We only need to calculate a new candidate list if the expression has
        // changed (we can ignore this.completionBase.pre since completions do not
        // depend upon that).
        if (preExpr !== this.completionBase.expr)
        {
            this.completionBase.expr = preExpr;
            this.completionBase.candidates = autoCompleteEval(context, preExpr, spreExpr);
        }

        this.createCompletions(prop);
    };

    /**
     * From a valid completion base, create a list of completions (containing
     * those completion candidates that share a prefix with the user's input)
     * and a default completion.
     */
    this.createCompletions = function(prefix)
    {
        var candidates = this.completionBase.candidates;
        var valid = [];

        if (!this.completionBase.expr && !prefix)
        {
            // Don't complete "".
        }
        else
        {
            for (var i = 0; i < candidates.length; ++i)
            {
                var name = candidates[i];
                if (name.lastIndexOf(prefix, 0) === 0)
                    valid.push(name);
            }
        }

        if (valid.length > 0)
        {
            this.completions = {
                list: valid,
                prefix: prefix
            };
            this.pickDefaultCandidate();
        }
        else
        {
            this.completions = null;
        }
    };

    /**
     * Chose a default candidate from the list of completions. This is currently
     * selected as the shortest completion, to make completions disappear when
     * typing a variable name that is also the prefix of another.
     */
    this.pickDefaultCandidate = function()
    {
        var pick = 0;
        var ar = this.completions.list;
        for (var i = 1; i < ar.length; i++)
        {
            if (ar[i].length < ar[pick].length)
                pick = i;
        }
        this.completions.index = pick;
    };

    /**
     * Go backward or forward one step in the list of completions.
     * dir is the relative movement in the list; -1 means backward and 1 forward.
     */
    this.cycle = function(dir)
    {
        this.completions.index += dir;
        if (this.completions.index >= this.completions.list.length)
            this.completions.index = 0;
        else if (this.completions.index < 0)
            this.completions.index = this.completions.list.length - 1;
        this.showCompletions();
    };

    /**
     * Get the property name that is currently selected as a completion (or
     * null if there is none).
     */
    this.getCurrentCompletion = function()
    {
        return (this.completions ? this.completions.list[this.completions.index] : null);
    };

    /**
     * Get the value the completion box should have for some value of the
     * text box and a selected completion.
     */
    this.getCompletionBoxValue = function()
    {
        var completion = this.getCurrentCompletion();
        if (completion === null)
            return this.textBox.value;
        return this.completionBase.pre + this.completionBase.expr + completion;
    };

    /**
     * Update the completion box and popup to be consistent with the current
     * state of the auto-completer.
     */
    this.showCompletions = function()
    {
        this.completionBox.value = this.getCompletionBoxValue();

        if (this.showCompletionPopup && this.completions && this.completions.list.length > 1)
            this.popupCandidates();
        else
            this.closePopup();
    };

    /**
     * Handle a keypress event. Returns true if the auto-completer used up
     * the event and does not want it to propagate further.
     */
    this.handleKeyPress = function(event, context)
    {
        var clearedTabWarning = this.clearTabWarning();

        if (Events.isAlt(event))
            return false;

        if (event.keyCode === KeyEvent.DOM_VK_TAB && !Events.isControl(event))
        {
            if (!this.completions)  // then no completions,
            {
                if (clearedTabWarning) // then you were warned,
                    return false; //  pass TAB along

                this.setTabWarning();
                Events.cancelEvent(event);
                return true;
            }
            else  // complete
            {
                this.acceptCompletion();
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_RIGHT && this.completions &&
            this.textBox.selectionStart === this.textBox.value.length)
        {
            // Complete on right arrow at end of line.
            this.acceptCompletion();
            Events.cancelEvent(event);
            return true;
        }
        else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE)
        {
            if (this.completions)
            {
                this.hideForExpression();

                // Stop event bubbling if it was used to close the popup.
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_UP || event.keyCode === KeyEvent.DOM_VK_DOWN)
        {
            if (this.completions)
            {
                this.cycle((event.keyCode === KeyEvent.DOM_VK_UP ? -1 : 1));
                Events.cancelEvent(event);
                return true;
            }
            // else the arrow will fall through to command history
        }
    };

    /**
     * Handle a keydown event.
     */
    this.handleKeyDown = function(event, context)
    {
        if (event.keyCode === KeyEvent.DOM_VK_ESCAPE && this.completions)
        {
            // Close the completion popup on escape in keydown, so that the popup
            // does not close itself and prevent event propagation on keypress.
            this.closePopup();
        }
    };

    this.clearTabWarning = function()
    {
        if (this.tabWarning)
        {
            this.completionBox.value = "";
            delete this.tabWarning;
            return true;
        }
        return false;
    };

    this.setTabWarning = function()
    {
        this.completionBox.value = this.textBox.value + "    " +
            Locale.$STR("firebug.completion.empty");

        this.tabWarning = true;
    };

    /**
     * Accept the currently shown completion in the text box.
     */
    this.acceptCompletion = function()
    {
        var completion = this.getCurrentCompletion();
        completion = adjustCompletionOnAccept(this.completionBase.pre,
                this.completionBase.expr, completion);

        var originalValue = this.textBox.value;
        this.textBox.value = completion;
        setCursorToEOL(this.textBox);

        this.hide();
        this.revertValue = originalValue;
    };

    this.popupCandidates = function()
    {
        var commandCompletionLineLimit = 40;

        Dom.eraseNode(this.completionPopup);
        this.selectedPopupElement = null;

        var vbox = this.completionPopup.ownerDocument.createElement("vbox");
        this.completionPopup.appendChild(vbox);
        vbox.classList.add("fbCommandLineCompletions");

        var title = this.completionPopup.ownerDocument.
            createElementNS("http://www.w3.org/1999/xhtml","div");
        title.innerHTML = Locale.$STR("console.Use Arrow keys or Enter");
        title.classList.add("fbPopupTitle");
        vbox.appendChild(title);

        var escPrefix = Str.escapeForTextNode(this.textBox.value);

        var showTop = 0;
        var showBottom = this.completions.list.length;
        if (this.completions.list.length > commandCompletionLineLimit)
        {
            if (this.completions.index <= (commandCompletionLineLimit - 3))
            {
                // We are in the top part of the list.
                showBottom = commandCompletionLineLimit;
            }
            else
            {
                // Implement manual scrolling.
                if (this.completions.index > (this.completions.list.length - 3))
                    showBottom = this.completions.list.length;
                else
                    showBottom = this.completions.index + 3;
            }

            showTop = showBottom - commandCompletionLineLimit;
        }

        for (var i = showTop; i < showBottom; i++)
        {
            var hbox = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","div");
            hbox.completionIndex = i;

            var pre = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","span");
            pre.innerHTML = escPrefix;
            pre.classList.add("userTypedText");

            var completion = this.completions.list[i].substr(this.completions.prefix.length);
            var post = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","span");
            post.innerHTML = Str.escapeForTextNode(completion);
            post.classList.add("completionText");

            if (i === this.completions.index)
                this.selectedPopupElement = hbox;

            hbox.appendChild(pre);
            hbox.appendChild(post);
            vbox.appendChild(hbox);
        }

        if (this.selectedPopupElement)
            this.selectedPopupElement.setAttribute("selected", "true");

        this.linuxFocusHack = true;
        setTimeout(this.focusHack, 10);
        this.completionPopup.openPopup(this.textBox, "before_start", 0, 0, false, false);
    };

    this.closePopup = function()
    {
        if (this.completionPopup.state == "closed")
            return;

        try
        {
            this.completionPopup.hidePopup();
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.JSAutoCompleter.closePopup; EXCEPTION " + err, err);
        }
    };

    this.getCompletionPopupElementFromEvent = function(event)
    {
        var selected = event.target;
        while (selected && selected.localName !== "div")
            selected = selected.parentNode;

        return (selected && typeof selected.completionIndex !== "undefined" ? selected : null);
    };

    this.popupMousedown = function(event)
    {
        var el = this.getCompletionPopupElementFromEvent(event);
        if (!el)
            return;

        if (this.selectedPopupElement)
            this.selectedPopupElement.removeAttribute("selected");

        this.selectedPopupElement = el;
        this.selectedPopupElement.setAttribute("selected", "true");
        this.completions.index = el.completionIndex;
        this.completionBox.value = this.getCompletionBoxValue();
    };

    this.popupClick = function(event)
    {
        var el = this.getCompletionPopupElementFromEvent(event);
        if (!el)
            return;

        this.completions.index = el.completionIndex;
        this.acceptCompletion();
    };

    this.popupMousedown = Obj.bind(this.popupMousedown, this);
    this.popupClick = Obj.bind(this.popupClick, this);

    this.focusHack = function(event)
    {
        if (this.linuxFocusHack)
        {
            // XXXjjb This does not work, but my experience with focus is that
            // it usually does not work.
            this.textBox.focus();
            delete this.linuxFocusHack;
        }
    };

    this.focusHack = Obj.bind(this.focusHack, this);

    /**
     * A destructor function, to be called when the auto-completer is destroyed.
     */
    this.shutdown = function()
    {
        this.completionBox.value = "";

        Events.removeEventListener(this.completionPopup, "mousedown", this.popupMousedown, true);
        Events.removeEventListener(this.completionPopup, "click", this.popupClick, true);
    };

    Events.addEventListener(this.completionPopup, "mousedown", this.popupMousedown, true);
    Events.addEventListener(this.completionPopup, "click", this.popupClick, true);
};


/**
 * A dummy auto-completer, set as current by CommandLine.setAutoCompleter when
 * no completion is supposed to be done (such as in the large command line,
 * currently, or when there is no context).
 */
Firebug.EmptyJSAutoCompleter = function()
{
    this.empty = true;
    this.shutdown = function() {};
    this.hide = function() {};
    this.complete = function() {};
    this.acceptReturn = function() { return true; };
    this.revert = function() { return false; };
    this.handleKeyDown = function() {};
    this.handleKeyPress = function() {};
};

// ********************************************************************************************* //
// Auto-completion helpers

/**
 * Try to find the position at which the expression to be completed starts.
 */
function getExpressionOffset(command)
{
    var bracketCount = 0;

    var start = command.length, instr = false;

    // When completing []-accessed properties, start instead from the last [.
    var lastBr = command.lastIndexOf("[");
    if (lastBr !== -1 && /^" *$/.test(command.substr(lastBr+1)))
        start = lastBr;

    for (var i = start-1; i >= 0; --i)
    {
        var c = command[i];
        if (reOpenBracket.test(c))
        {
            if (bracketCount)
                --bracketCount;
            else
                break;
        }
        else if (reCloseBracket.test(c))
        {
            var next = command[i + 1];
            if (bracketCount === 0 && next !== "." && next !== "[")
                break;
            else
                ++bracketCount;
        }
        else if (bracketCount === 0)
        {
            if (c === '"') instr = !instr;
            else if (!instr && !reJSChar.test(c) && c !== ".")
                break;
        }
    }
    ++i;

    // The 'new' operator has higher precedence than function calls, so, if
    // present, it should be included if the expression contains a parenthesis.
    if (i-4 >= 0 && command.indexOf("(", i) !== -1 && command.substr(i-4, 4) === "new ")
    {
        i -= 4;
    }

    return i;
}

/**
 * Try to find the position at which the property name of the final property
 * access in an expression starts (for example, 2 in 'a.b').
 */
function getPropertyOffset(expr)
{
    var lastBr = expr.lastIndexOf("[");
    if (lastBr !== -1 && /^" *$/.test(expr.substr(lastBr+1)))
        return lastBr+2;

    var lastDot = expr.lastIndexOf(".");
    if (lastDot !== -1)
        return lastDot+1;

    return 0;
}

/**
 * Get the index of the last non-whitespace character in the range [0, from)
 * in str, or -1 if there is none.
 */
function prevNonWs(str, from)
{
    for (var i = from-1; i >= 0; --i)
    {
        if (str.charAt(i) !== " ")
            return i;
    }
    return -1;
}

/**
 * Find the start of a word consisting of characters matching reJSChar, if
 * str[from] is the last character in the word. (This can be used together
 * with prevNonWs to traverse words backwards from a position.)
 */
function prevWord(str, from)
{
    for (var i = from-1; i >= 0; --i)
    {
        if (!reJSChar.test(str.charAt(i)))
            return i+1;
    }
    return 0;
}

function isFunctionName(expr, pos)
{
    pos -= 9;
    return (pos >= 0 && expr.substr(pos, 9) === "function " &&
            (pos === 0 || !reJSChar.test(expr.charAt(pos-1))));
}

function bwFindMatchingParen(expr, from)
{
    var bcount = 1;
    for (var i = from-1; i >= 0; --i)
    {
        if (reCloseBracket.test(expr.charAt(i)))
            ++bcount;
        else if (reOpenBracket.test(expr.charAt(i)))
            if (--bcount === 0)
                return i;
    }
    return -1;
}

/**
 * Check if a '/' at the end of 'expr' would be a regex or a division.
 * May also return null if the expression seems invalid.
 */
function endingDivIsRegex(expr)
{
    var kwActions = ["throw", "return", "in", "instanceof", "delete", "new",
        "do", "else", "typeof", "void", "yield"];
    var kwCont = ["function", "if", "while", "for", "switch", "catch", "with"];

    var ind = prevNonWs(expr, expr.length), ch = (ind === -1 ? "{" : expr.charAt(ind));
    if (reJSChar.test(ch))
    {
        // Test if the previous word is a keyword usable like 'kw <expr>'.
        // If so, we have a regex, otherwise, we have a division (a variable
        // or literal being divided by something).
        var w = expr.substring(prevWord(expr, ind), ind+1);
        return (kwActions.indexOf(w) !== -1);
    }
    else if (ch === ")")
    {
        // We have a regex in the cases 'if (...) /blah/' and 'function name(...) /blah/'.
        ind = bwFindMatchingParen(expr, ind);
        if (ind === -1)
            return null;
        ind = prevNonWs(expr, ind);
        if (ind === -1)
            return false;
        if (!reJSChar.test(expr.charAt(ind)))
            return false;
        var wind = prevWord(expr, ind);
        if (kwCont.indexOf(expr.substring(wind, ind+1)) !== -1)
            return true;
        return isFunctionName(expr, wind);
    }
    else if (ch === "]")
    {
        return false;
    }
    return true;
}

// Check if a "{" in an expression is an object declaration.
function isObjectDecl(expr, pos)
{
    var ind = prevNonWs(expr, pos);
    if (ind === -1)
        return false;
    var ch = expr.charAt(ind);
    return !(ch === ")" || ch === "{" || ch === "}" || ch === ";");
}

function isCommaProp(expr, start)
{
    var beg = expr.lastIndexOf(",")+1;
    if (beg < start)
        beg = start;
    while (expr.charAt(beg) === " ")
        ++beg;
    var prop = expr.substr(beg);
    return isValidProperty(prop);
}

function simplifyExpr(expr)
{
    var ret = "", len = expr.length, instr = false, strend, inreg = false, inclass, brackets = [];

    for (var i = 0; i < len; ++i)
    {
        var ch = expr.charAt(i);
        if (instr)
        {
            if (ch === strend)
            {
                ret += '"';
                instr = false;
            }
            else
            {
                if (ch === "\\" && i+1 !== len)
                {
                    ret += " ";
                    ++i;
                }
                ret += " ";
            }
        }
        else if (inreg)
        {
            if (inclass && ch === "]")
                inclass = false;
            else if (!inclass && ch === "[")
                inclass = true;
            else if (!inclass && ch === "/")
            {
                // End of regex, eat regex flags
                inreg = false;
                while (i+1 !== len && reJSChar.test(expr.charAt(i+1)))
                {
                    ret += " ";
                    ++i;
                }
                ret += '"';
            }
            if (inreg)
            {
                if (ch === "\\" && i+1 !== len)
                {
                    ret += " ";
                    ++i;
                }
                ret += " ";
            }
        }
        else
        {
            if (ch === "'" || ch === '"')
            {
                instr = true;
                strend = ch;
                ret += '"';
            }
            else if (ch === "/")
            {
                var re = endingDivIsRegex(ret);
                if (re === null)
                    return null;
                if (re)
                {
                    inreg = true;
                    ret += '"';
                }
                else
                    ret += "/";
            }
            else
            {
                if (reOpenBracket.test(ch))
                    brackets.push(ch);
                else if (reCloseBracket.test(ch))
                {
                    // Check for mismatched brackets
                    if (!brackets.length)
                        return null;
                    var br = brackets.pop();
                    if (br === "(" && ch !== ")")
                        return null;
                    if (br === "[" && ch !== "]")
                        return null;
                    if (br === "{" && ch !== "}")
                        return null;
                }
                ret += ch;
            }
        }
    }

    return ret;
}

// Check if auto-completion should be killed.
function killCompletions(expr, origExpr)
{
    // Make sure there is actually something to complete at the end.
    if (expr.length === 0)
        return true;

    if (reJSChar.test(expr[expr.length-1]) ||
            expr[expr.length-1] === ".")
    {
        // An expression at the end - we're fine.
    }
    else
    {
        var lastBr = expr.lastIndexOf("[");
        if (lastBr !== -1 && /^" *$/.test(expr.substr(lastBr+1)) &&
            origExpr.charAt(lastBr+1) !== "/")
        {
            // Array completions - we're fine.
        }
        else {
            return true;
        }
    }

    // Check for 'function i'.
    var ind = expr.lastIndexOf(" ");
    if (isValidProperty(expr.substr(ind+1)) && isFunctionName(expr, ind+1))
        return true;

    // Check for '{prop: ..., i'.
    var bwp = bwFindMatchingParen(expr, expr.length);
    if (bwp !== -1 && expr.charAt(bwp) === "{" &&
            isObjectDecl(expr, bwp) && isCommaProp(expr, bwp+1))
    {
        return true;
    }

    // Check for 'var prop..., i'.
    var vind = expr.lastIndexOf("var ");
    if (bwp < vind && isCommaProp(expr, vind+4))
    {
        // Note: This doesn't strictly work, because it kills completions even
        // when we have started a new expression and used the comma operator
        // in it (ie. 'var a; a, i'). This happens very seldom though, so it's
        // not really a problem.
        return true;
    }

    // Check for 'function f(i'.
    while (bwp !== -1 && expr.charAt(bwp) !== "(")
    {
        bwp = bwFindMatchingParen(expr, bwp);
    }
    if (bwp !== -1)
    {
        var ind = prevNonWs(expr, bwp);
        if (ind !== -1)
        {
            var stw = prevWord(expr, ind);
            if (expr.substring(stw, ind+1) === "function")
                return true;
            ind = prevNonWs(expr, stw);
            if (ind !== -1 && expr.substring(prevWord(expr, ind), ind+1) === "function")
                return true;
        }
    }
    return false;
}

function adjustCompletionOnAccept(preParsed, preExpr, property)
{
    var res = preParsed + preExpr + property;

    // Don't adjust index completions.
    if (/^\[['"]$/.test(preExpr.slice(-2)))
        return res;

    if (!isValidProperty(property))
    {
        // The property name is actually invalid in free form, so replace
        // it with array syntax.

        if (preExpr)
        {
            res = preParsed + preExpr.slice(0, -1);
        }
        else
        {
            // Global variable access - assume the variable is a member of 'window'.
            res = preParsed + "window";
        }
        res += '["' + Str.escapeJS(property) + '"]';
    }
    return res;
}

// Types the autocompletion knows about, some of their non-enumerable properties,
// and the return types of some member functions, included in the Firebug.CommandLine
// object to make it more easily extensible.

Firebug.CommandLine.AutoCompletionKnownTypes = {
    "void": {
        "_fb_ignorePrototype": true
    },
    "Array": {
        "pop": "|void",
        "push": "|void",
        "shift": "|void",
        "unshift": "|void",
        "reverse": "|Array",
        "sort": "|Array",
        "splice": "|Array",
        "concat": "|Array",
        "slice": "|Array",
        "join": "|String",
        "indexOf": "|Number",
        "lastIndexOf": "|Number",
        "filter": "|Array",
        "map": "|Array",
        "reduce": "|void",
        "reduceRight": "|void",
        "every": "|void",
        "forEach": "|void",
        "some": "|void",
        "length": "Number"
    },
    "String": {
        "_fb_contType": "String",
        "split": "|Array",
        "substr": "|String",
        "substring": "|String",
        "charAt": "|String",
        "charCodeAt": "|String",
        "concat": "|String",
        "indexOf": "|Number",
        "lastIndexOf": "|Number",
        "localeCompare": "|Number",
        "match": "|Array",
        "search": "|Number",
        "slice": "|String",
        "replace": "|String",
        "toLowerCase": "|String",
        "toLocaleLowerCase": "|String",
        "toUpperCase": "|String",
        "toLocaleUpperCase": "|String",
        "trim": "|String",
        "length": "Number"
    },
    "RegExp": {
        "test": "|void",
        "exec": "|Array",
        "lastIndex": "Number",
        "ignoreCase": "void",
        "global": "void",
        "multiline": "void",
        "source": "String"
    },
    "Date": {
        "getTime": "|Number",
        "getYear": "|Number",
        "getFullYear": "|Number",
        "getMonth": "|Number",
        "getDate": "|Number",
        "getDay": "|Number",
        "getHours": "|Number",
        "getMinutes": "|Number",
        "getSeconds": "|Number",
        "getMilliseconds": "|Number",
        "getUTCFullYear": "|Number",
        "getUTCMonth": "|Number",
        "getUTCDate": "|Number",
        "getUTCDay": "|Number",
        "getUTCHours": "|Number",
        "getUTCMinutes": "|Number",
        "getUTCSeconds": "|Number",
        "getUTCMilliseconds": "|Number",
        "setTime": "|void",
        "setYear": "|void",
        "setFullYear": "|void",
        "setMonth": "|void",
        "setDate": "|void",
        "setHours": "|void",
        "setMinutes": "|void",
        "setSeconds": "|void",
        "setMilliseconds": "|void",
        "setUTCFullYear": "|void",
        "setUTCMonth": "|void",
        "setUTCDate": "|void",
        "setUTCHours": "|void",
        "setUTCMinutes": "|void",
        "setUTCSeconds": "|void",
        "setUTCMilliseconds": "|void",
        "toUTCString": "|String",
        "toLocaleDateString": "|String",
        "toLocaleTimeString": "|String",
        "toLocaleFormat": "|String",
        "toDateString": "|String",
        "toTimeString": "|String",
        "toISOString": "|String",
        "toGMTString": "|String",
        "toJSON": "|String",
        "toString": "|String",
        "toLocaleString": "|String",
        "getTimezoneOffset": "|Number"
    },
    "Function": {
        "call": "|void",
        "apply": "|void",
        "length": "Number",
        "prototype": "void"
    },
    "HTMLElement": {
        "getElementsByClassName": "|NodeList",
        "getElementsByTagName": "|NodeList",
        "getElementsByTagNameNS": "|NodeList",
        "querySelector": "|HTMLElement",
        "querySelectorAll": "|NodeList",
        "firstChild": "HTMLElement",
        "lastChild": "HTMLElement",
        "firstElementChild": "HTMLElement",
        "lastElementChild": "HTMLElement",
        "parentNode": "HTMLElement",
        "previousSibling": "HTMLElement",
        "nextSibling": "HTMLElement",
        "previousElementSibling": "HTMLElement",
        "nextElementSibling": "HTMLElement",
        "children": "NodeList",
        "childNodes": "NodeList"
    },
    "NodeList": {
        "_fb_contType": "HTMLElement",
        "length": "Number",
        "item": "|HTMLElement",
        "namedItem": "|HTMLElement"
    },
    "Window": {
        "encodeURI": "|String",
        "encodeURIComponent": "|String",
        "decodeURI": "|String",
        "decodeURIComponent": "|String",
        "eval": "|void",
        "parseInt": "|Number",
        "parseFloat": "|Number",
        "isNaN": "|void",
        "isFinite": "|void",
        "NaN": "Number",
        "Math": "Math",
        "undefined": "void",
        "Infinity": "Number"
    },
    "HTMLDocument": {
        "querySelector": "|HTMLElement",
        "querySelectorAll": "|NodeList"
    },
    "Math": {
        "E": "Number",
        "LN2": "Number",
        "LN10": "Number",
        "LOG2E": "Number",
        "LOG10E": "Number",
        "PI": "Number",
        "SQRT1_2": "Number",
        "SQRT2": "Number",
        "abs": "|Number",
        "acos": "|Number",
        "asin": "|Number",
        "atan": "|Number",
        "atan2": "|Number",
        "ceil": "|Number",
        "cos": "|Number",
        "exp": "|Number",
        "floor": "|Number",
        "log": "|Number",
        "max": "|Number",
        "min": "|Number",
        "pow": "|Number",
        "random": "|Number",
        "round": "|Number",
        "sin": "|Number",
        "sqrt": "|Number",
        "tan": "|Number"
    },
    "Number": {
        // There are also toFixed and valueOf, but they are left out because
        // they steal focus from toString by being shorter (in the case of
        // toFixed), and because they are used very seldom.
        "toExponential": "|String",
        "toPrecision": "|String",
        "toLocaleString": "|String",
        "toString": "|String"
    }
};

var LinkType = {
    "PROPERTY": 0,
    "INDEX": 1,
    "CALL": 2,
    "SAFECALL": 3,
    "RETVAL_HEURISTIC": 4
};

function getKnownType(t)
{
    var known = Firebug.CommandLine.AutoCompletionKnownTypes;
    if (known.hasOwnProperty(t))
        return known[t];
    return null;
}

function getKnownTypeInfo(r)
{
    if (r.charAt(0) === "|")
        return {"val": "Function", "ret": r.substr(1)};
    return {"val": r};
}

function getFakeCompleteKeys(name)
{
    var ret = [], type = getKnownType(name);
    if (!type)
        return ret;
    for (var prop in type) {
        if (prop.substr(0, 4) !== "_fb_")
            ret.push(prop);
    }
    return ret;
}

function eatProp(expr, start)
{
    for (var i = start; i < expr.length; ++i)
        if (!reJSChar.test(expr.charAt(i)))
            break;
    return i;
}

function matchingBracket(expr, start)
{
    var count = 1;
    for (var i = start + 1; i < expr.length; ++i) {
        var ch = expr.charAt(i);
        if (reOpenBracket.test(ch))
            ++count;
        else if (reCloseBracket.test(ch))
            if (!--count)
                return i;
    }
    return -1;
}

function getTypeExtractionExpression(command)
{
    // Return a JavaScript expression for determining the type / [[Class]] of
    // an object given by another JavaScript expression. For DOM nodes, return
    // HTMLElement instead of HTML[node type]Element, for simplicity.
    var ret = "(function() { var v = " + command + "; ";
    ret += "if (window.HTMLElement && v instanceof HTMLElement) return 'HTMLElement'; ";
    ret += "return Object.prototype.toString.call(v).slice(8, -1);})()";
    return ret;
}

function sortUnique(ar)
{
    ar = ar.slice();
    ar.sort();
    var ret = [];
    for (var i = 0; i < ar.length; ++i)
    {
        if (i && ar[i-1] === ar[i])
            continue;
        ret.push(ar[i]);
    }
    return ret;
}

function propChainBuildComplete(out, context, tempExpr, result)
{
    var complete = null, command = null;
    if (tempExpr.fake)
    {
        var name = tempExpr.value.val;
        complete = getFakeCompleteKeys(name);
        if (!getKnownType(name)._fb_ignorePrototype)
            command = name + ".prototype";
    }
    else
    {
        if (typeof result === "string")
        {
            // Strings only have indices as properties, use the fake object
            // completions instead.
            tempExpr.fake = true;
            tempExpr.value = getKnownTypeInfo("String");
            propChainBuildComplete(out, context, tempExpr);
            return;
        }
        else if (FirebugReps.Arr.isArray(result, context.window))
            complete = nonNumericKeys(result);
        else
            complete = Arr.keys(result);
        command = getTypeExtractionExpression(tempExpr.command);
    }

    var done = function()
    {
        if (out.indexCompletion)
        {
            complete = complete.map(function(x)
            {
                x = (out.indexQuoteType === '"') ? Str.escapeJS(x): Str.escapeSingleQuoteJS(x);
                return x + out.indexQuoteType + "]";
            });
        }

        // Properties may be taken from several sources, so filter out duplicates.
        out.complete = sortUnique(complete);
    };

    if (command === null)
    {
        done();
    }
    else
    {
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (tempExpr.fake)
                {
                    complete = complete.concat(Arr.keys(result));
                }
                else
                {
                    if (typeof result === "string" && getKnownType(result))
                    {
                        complete = complete.concat(getFakeCompleteKeys(result));
                    }
                }
                done();
            },
            function failed(result, context)
            {
                done();
            }
        );
    }
}

function evalPropChainStep(step, tempExpr, evalChain, out, context)
{
    if (tempExpr.fake)
    {
        if (step === evalChain.length)
        {
            propChainBuildComplete(out, context, tempExpr);
            return;
        }

        var link = evalChain[step], type = link.type;
        if (type === LinkType.PROPERTY || type === LinkType.INDEX)
        {
            // Use the accessed property if it exists, otherwise abort. It
            // would be possible to continue with a 'real' expression of
            // `tempExpr.value.val`.prototype, but since prototypes seldom
            // contain actual values of things this doesn't work very well.
            var mem = (type === LinkType.INDEX ? "_fb_contType" : link.name);
            var t = getKnownType(tempExpr.value.val);
            if (t.hasOwnProperty(mem))
                tempExpr.value = getKnownTypeInfo(t[mem]);
            else
                return;
        }
        else if (type === LinkType.CALL)
        {
            if (tempExpr.value.ret)
                tempExpr.value = getKnownTypeInfo(tempExpr.value.ret);
            else
                return;
        }
        evalPropChainStep(step+1, tempExpr, evalChain, out, context);
    }
    else
    {
        var funcCommand = null, link, type;
        while (step !== evalChain.length)
        {
            link = evalChain[step];
            type = link.type;
            if (type === LinkType.PROPERTY)
            {
                tempExpr.thisCommand = tempExpr.command;
                tempExpr.command += "." + link.name;
            }
            else if (type === LinkType.INDEX)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "[" + link.cont + "]";
            }
            else if (type === LinkType.SAFECALL)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "(" + link.origCont + ")";
            }
            else if (type === LinkType.CALL)
            {
                if (link.name === "")
                {
                    // We cannot know about functions without name; try the
                    // heuristic directly.
                    link.type = LinkType.RETVAL_HEURISTIC;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }

                funcCommand = getTypeExtractionExpression(tempExpr.thisCommand);
                break;
            }
            else if (type === LinkType.RETVAL_HEURISTIC)
            {
                if (link.origCont !== null &&
                     (link.name.substr(0, 3) === "get" ||
                      (link.name.charAt(0) === "$" && link.cont.indexOf(",") === -1)))
                {
                    // Names beginning with get or $ are almost always getters, so
                    // assume it is a safecall and start over.
                    link.type = LinkType.SAFECALL;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }
                funcCommand = "Function.prototype.toString.call(" + tempExpr.command + ")";
                break;
            }
            ++step;
        }

        var func = (funcCommand !== null), command = (func ? funcCommand : tempExpr.command);
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (func)
                {
                    if (type === LinkType.CALL)
                    {
                        if (typeof result !== "string")
                            return;

                        var t = getKnownType(result);
                        if (t && t.hasOwnProperty(link.name))
                        {
                            var propVal = getKnownTypeInfo(t[link.name]);

                            // Make sure the property is a callable function
                            if (!propVal.ret)
                                return;

                            tempExpr.fake = true;
                            tempExpr.value = getKnownTypeInfo(propVal.ret);
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                        }
                        else
                        {
                            // Unknown 'this' type or function name, use
                            // heuristics on the function instead.
                            link.type = LinkType.RETVAL_HEURISTIC;
                            evalPropChainStep(step, tempExpr, evalChain, out, context);
                        }
                    }
                    else if (type === LinkType.RETVAL_HEURISTIC)
                    {
                        if (typeof result !== "string")
                            return;

                        // Perform some crude heuristics for figuring out the
                        // return value of a function based on its contents.
                        // It's certainly not perfect, and it's easily fooled
                        // into giving wrong results,  but it might work in
                        // some common cases.

                        // Check for chaining functions. This is done before
                        // checking for nested functions, because completing
                        // results of member functions containing nested
                        // functions that use 'return this' seems uncommon,
                        // and being wrong is not a huge problem.
                        if (result.indexOf("return this;") !== -1)
                        {
                            tempExpr.command = tempExpr.thisCommand;
                            tempExpr.thisCommand = "window";
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                            return;
                        }

                        // Don't support nested functions.
                        if (result.lastIndexOf("function") !== 0)
                            return;

                        // Check for arrays.
                        if (result.indexOf("return [") !== -1)
                        {
                            tempExpr.fake = true;
                            tempExpr.value = getKnownTypeInfo("Array");
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                            return;
                        }

                        // Check for 'return new Type(...);', and use the
                        // prototype as a pseudo-object for those (since it
                        // is probably not a known type that we can fake).
                        var newPos = result.indexOf("return new ");
                        if (newPos !== -1)
                        {
                            var rest = result.substr(newPos + 11),
                                epos = rest.search(/[^a-zA-Z0-9_$.]/);
                            if (epos !== -1)
                            {
                                rest = rest.substring(0, epos);
                                tempExpr.command = rest + ".prototype";
                                evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                                return;
                            }
                        }
                    }
                }
                else
                {
                    propChainBuildComplete(out, context, tempExpr, result);
                }
            },
            function failed(result, context) { }
        );
    }
}

function evalPropChain(out, preExpr, origExpr, context)
{
    var evalChain = [], linkStart = 0, len = preExpr.length, lastProp = "";
    var tempExpr = {"fake": false, "command": "window", "thisCommand": "window"};
    while (linkStart !== len)
    {
        var ch = preExpr.charAt(linkStart);
        if (linkStart === 0)
        {
            if (preExpr.substr(0, 4) === "new ")
            {
                var parInd = preExpr.indexOf("(");
                tempExpr.command = preExpr.substring(4, parInd) + ".prototype";
                linkStart = matchingBracket(preExpr, parInd) + 1;
            }
            else if (ch === "[")
            {
                tempExpr.fake = true;
                tempExpr.value = getKnownTypeInfo("Array");
                linkStart = matchingBracket(preExpr, linkStart) + 1;
            }
            else if (ch === '"')
            {
                var isRegex = (origExpr.charAt(0) === "/");
                tempExpr.fake = true;
                tempExpr.value = getKnownTypeInfo(isRegex ? "RegExp" : "String");
                linkStart = preExpr.indexOf('"', 1) + 1;
            }
            else if (!isNaN(ch))
            {
                // The expression is really a decimal number.
                return false;
            }
            else if (reJSChar.test(ch))
            {
                // The expression begins with a regular property name
                var nextLink = eatProp(preExpr, linkStart);
                lastProp = preExpr.substring(linkStart, nextLink);
                linkStart = nextLink;
                tempExpr.command = lastProp;
            }

            // Syntax error (like '.') or a too complicated expression.
            if (linkStart === 0)
                return false;
        }
        else
        {
            if (ch === ".")
            {
                // Property access
                var nextLink = eatProp(preExpr, linkStart+1);
                lastProp = preExpr.substring(linkStart+1, nextLink);
                linkStart = nextLink;
                evalChain.push({"type": LinkType.PROPERTY, "name": lastProp});
            }
            else if (ch === "(")
            {
                // Function call. Save the function name and the arguments if
                // they are safe to evaluate.
                var endCont = matchingBracket(preExpr, linkStart);
                var cont = preExpr.substring(linkStart+1, endCont), origCont = null;
                if (reLiteralExpr.test(cont))
                    origCont = origExpr.substring(linkStart+1, endCont);
                linkStart = endCont + 1;
                evalChain.push({
                    "type": LinkType.CALL,
                    "name": lastProp,
                    "origCont": origCont,
                    "cont": cont
                });

                lastProp = "";
            }
            else if (ch === "[")
            {
                // Index. Use the supplied index if it is a literal; otherwise
                // it is probably a loop index with a variable not yet defined
                // (like 'for(var i = 0; i < ar.length; ++i) ar[i].prop'), and
                // '0' seems like a reasonably good guess at a valid index.
                var endInd = matchingBracket(preExpr, linkStart);
                var ind = preExpr.substring(linkStart+1, endInd);
                if (reLiteralExpr.test(ind))
                    ind = origExpr.substring(linkStart+1, endInd);
                else
                    ind = "0";
                linkStart = endInd+1;
                evalChain.push({"type": LinkType.INDEX, "cont": ind});
                lastProp = "";
            }
            else
            {
                // Syntax error
                return false;
            }
        }
    }

    evalPropChainStep(0, tempExpr, evalChain, out, context);
    return true;
}

function autoCompleteEval(context, preExpr, spreExpr)
{
    var out = {};

    out.complete = [];

    try
    {
        if (spreExpr)
        {
            // Complete member variables of some .-chained expression

            // In case of array indexing, remove the bracket and set a flag to
            // escape completions.
            out.indexCompletion = false;
            var len = spreExpr.length, lastCh = spreExpr[len-1];
            if (len >= 2 && spreExpr[len-2] === "[" && spreExpr[len-1] === '"')
            {
                out.indexCompletion = true;
                out.indexQuoteType = preExpr[len-1];
                spreExpr = spreExpr.substr(0, len-2);
                preExpr = preExpr.substr(0, len-2);
            }
            else
            {
                // Remove the trailing dot (if there is one)
                var lastDot = spreExpr.lastIndexOf(".");
                if (lastDot !== -1)
                {
                    spreExpr = spreExpr.substr(0, lastDot);
                    preExpr = preExpr.substr(0, lastDot);
                }
            }

            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.autoCompleteEval pre:'" + preExpr +
                    "' spre:'" + spreExpr + "'.");

            // Don't auto-complete '.'.
            if (spreExpr === "")
                return out.complete;

            evalPropChain(out, spreExpr, preExpr, context);
        }
        else
        {
            // Complete variables from the local scope

            var contentView = Wrapper.getContentView(context.window);
            if (context.stopped)
            {
                out.complete = Firebug.Debugger.getCurrentFrameKeys(context);
            }
            else if (contentView && contentView.Window &&
                contentView.constructor.toString() === contentView.Window.toString())
                // Cross window type pseudo-comparison
            {
                out.complete = Arr.keys(contentView); // return is safe

                // Add some known window properties
                out.complete = out.complete.concat(getFakeCompleteKeys("Window"));
            }
            else  // hopefully sandbox in Chromebug
            {
                out.complete = Arr.keys(context.global);
            }

            // Sort the completions, and avoid duplicates.
            out.complete = sortUnique(out.complete);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.autoCompleteEval FAILED", exc);
    }
    return out.complete;
}

var reValidJSToken = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
function isValidProperty(value)
{
    // Use only string props
    if (typeof(value) != "string")
        return false;

    // Use only those props that don't contain unsafe charactes and so need
    // quotation (e.g. object["my prop"] notice the space character).
    // Following expression checks that the name starts with a letter or $_,
    // and there are only letters, numbers or $_ character in the string (no spaces).

    return reValidJSToken.test(value);
}

const rePositiveNumber = /^[1-9][0-9]*$/;
function nonNumericKeys(map)  // keys will be on user-level window objects
{
    var keys = [];
    try
    {
        for (var name in map)  // enumeration is safe
        {
            if (! (name === "0" || rePositiveNumber.test(name)) )
                keys.push(name);
        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
    }

    return keys;  // return is safe
}

function setCursorToEOL(input)
{
    // textbox version, https://developer.mozilla.org/en/XUL/Property/inputField
    // input.inputField.setSelectionRange(len, len);
    input.setSelectionRange(input.value.length, input.value.length);
}

// ********************************************************************************************* //
// Command line APIs definition
//
// These functions will be called in the extension like this:
//   subHandler.apply(api, userObjects);
// where subHandler is one of the entries below, api is this object and userObjects are entries in
// an array we created in the web page.

function FirebugCommandLineAPI(context)
{
    this.$ = function(id)  // returns unwrapped elements from the page
    {
        return Wrapper.unwrapObject(context.baseWindow.document).getElementById(id);
    };

    this.$$ = function(selector) // returns unwrapped elements from the page
    {
        var result = Wrapper.unwrapObject(context.baseWindow.document).querySelectorAll(selector);
        return Arr.cloneArray(result);
    };

    this.$x = function(xpath) // returns unwrapped elements from the page
    {
        return Xpath.getElementsByXPath(Wrapper.unwrapObject(context.baseWindow.document), xpath);
    };

    this.$n = function(index) // values from the extension space
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

        Firebug.Console.log(["Current window:", context.baseWindow], context, "info");
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.clear = function()  // no web page interaction
    {
        Firebug.Console.clear(context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.inspect = function(obj, panelName)  // no web page interaction
    {
        Firebug.chrome.select(obj, panelName);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.keys = function(o)
    {
        return Arr.keys(o);  // the object is from the page, unwrapped
    };

    this.values = function(o)
    {
        return Arr.values(o); // the object is from the page, unwrapped
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

    this.monitorEvents = function(object, types)
    {
        EventMonitor.monitorEvents(object, types, context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.unmonitorEvents = function(object, types)
    {
        EventMonitor.unmonitorEvents(object, types, context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.profile = function(title)
    {
        Firebug.Profiler.startProfiling(context, title);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.profileEnd = function()
    {
        Firebug.Profiler.stopProfiling(context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.copy = function(x)
    {
        System.copyToClipboard(x);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.memoryProfile = function(title)
    {
        Firebug.MemoryProfiler.start(context, title);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };

    this.memoryProfileEnd = function()
    {
        Firebug.MemoryProfiler.stop(context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    };
}

// ********************************************************************************************* //

Firebug.CommandLine.CommandHistory = function()
{
    const commandHistoryMax = 1000;

    var commandsPopup = Firebug.chrome.$("fbCommandHistory");
    var commands = [];
    var commandPointer = 0;
    var commandInsertPointer = -1;

    this.getLastCommand = function()
    {
        var command = commands[commandInsertPointer];
        if (!command)
            return "";

        return command;
    };

    this.appendToHistory = function(command)
    {
        if (commands[commandInsertPointer] != command)
        {
            commandInsertPointer++;
            if (commandInsertPointer >= commandHistoryMax)
                commandInsertPointer = 0;

            commands[commandInsertPointer] = command;
        }

        commandPointer = commandInsertPointer + 1;

        if (Firebug.chrome.$("fbCommandLineHistoryButton").hasAttribute("disabled"))
        {
            Firebug.chrome.$("fbCommandLineHistoryButton").removeAttribute("disabled");
            Firebug.chrome.$("fbCommandEditorHistoryButton").removeAttribute("disabled");

            this.attachListeners();
        }
    };

    this.attachListeners = function()
    {
        Events.addEventListener(commandsPopup, "mouseover", this.onMouseOver, true);
        Events.addEventListener(commandsPopup, "mouseup", this.onMouseUp, true);
        Events.addEventListener(commandsPopup, "popuphidden", this.onPopupHidden, true);
    };

    this.detachListeners = function()
    {
        Events.removeEventListener(commandsPopup, "mouseover", this.onMouseOver, true);
        Events.removeEventListener(commandsPopup, "mouseup", this.onMouseUp, true);
        Events.removeEventListener(commandsPopup, "popuphidden", this.onPopupHidden, true);
    };

    this.cycleCommands = function(context, dir)
    {
        var command,
            commandLine = Firebug.CommandLine.getCommandLine(context);

        if (dir < 0)
        {
            if (commandPointer > 0)
                commandPointer--;
        }
        else
        {
            if (commandPointer < commands.length)
                commandPointer++;
        }

        if (commandPointer < commands.length)
        {
            command = commands[commandPointer];
            if (commandsPopup.state == "open")
            {
                var commandElements = commandsPopup.ownerDocument.getElementsByClassName(
                    "commandHistoryItem");
                this.selectCommand(commandElements[commandPointer]);
            }
        }
        else
        {
            command = "";
            this.removeCommandSelection();
        }

        commandLine.value = command;
        Firebug.CommandLine.autoCompleter.hide();
        Firebug.CommandLine.update(context);
        setCursorToEOL(commandLine);
    };

    this.isShown = function()
    {
        return commandsPopup.state == "open";
    };

    this.show = function(element)
    {
        if (this.isShown())
            return this.hide;

        Dom.eraseNode(commandsPopup);

        if(commands.length == 0)
            return;

        var vbox = commandsPopup.ownerDocument.createElement("vbox");

        for (var i = 0; i < commands.length; i++)
        {
            var hbox = commandsPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml", "div");

            hbox.classList.add("commandHistoryItem");
            var shortExpr = Str.cropString(Str.stripNewLines(commands[i]), 50);
            hbox.innerHTML = Str.escapeForTextNode(shortExpr);
            hbox.value = i;
            vbox.appendChild(hbox);

            if (i === commandPointer)
                this.selectCommand(hbox);
        }

        commandsPopup.appendChild(vbox);
        commandsPopup.openPopup(element, "before_start", 0, 0, false, false);

        return true;
    };

    this.hide = function()
    {
        commandsPopup.hidePopup();

        return true;
    };

    this.toggle = function(element)
    {
        this.isShown() ? this.hide() : this.show(element);
    };

    this.removeCommandSelection = function()
    {
        var selected = commandsPopup.ownerDocument.getElementsByClassName("selected")[0];
        Css.removeClass(selected, "selected");
    };

    this.selectCommand = function(element)
    {
        this.removeCommandSelection();

        Css.setClass(element, "selected");
    };

    this.onMouseOver = function(event)
    {
        var hovered = event.target;

        if (hovered.localName == "vbox")
            return;

        Firebug.CommandLine.commandHistory.selectCommand(hovered);
    };

    this.onMouseUp = function(event)
    {
        var commandLine = Firebug.CommandLine.getCommandLine(Firebug.currentContext);

        commandLine.value = commands[event.target.value];
        commandPointer = event.target.value;

        Firebug.CommandLine.commandHistory.hide();
    };

    this.onPopupHidden = function(event)
    {
        Firebug.chrome.setGlobalAttribute("fbCommandLineHistoryButton", "checked", "false");
        Firebug.chrome.setGlobalAttribute("fbCommandEditorHistoryButton", "checked", "false");
    };
};

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
        context.activeCommandLineHandlers[consoleHandler.token] = boundHandler;

        Events.addEventListener(win.document, "firebugExecuteCommand", boundHandler, true);

        if (FBTrace.DBG_COMMANDLINE)
        {
            FBTrace.sysout("commandLine.addCommandLineListener to document in window" +
                win.location + " with console ", win.console);
        }
    },

    removeCommandLineListener: function(context, win)
    {
        var boundHandler = this.getCommandLineListener(context, win);
        if (boundHandler)
            Events.removeEventListener(win.document, "firebugExecuteCommand", boundHandler, true);

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.detachCommandLineListener "+boundHandler+
                " in window with console "+win.location);
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

function CommandLineHandler(context, win)
{
    this.handleEvent = function(event)  // win is the window the handler is bound into
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
        var vars = htmlPanel ? htmlPanel.getInspectorVars():null;

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

            this.api[prop] = createHandler(prop);  // XXXjjb should these be removed?
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
