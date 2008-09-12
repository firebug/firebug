/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const commandHistoryMax = 1000;
const commandPrefix = ">>>";

const reOpenBracket = /[\[\(\{]/;
const reCloseBracket = /[\]\)\}]/;
const reCmdSource = /^with\(_FirebugCommandLine\){(.*)};$/;

// ************************************************************************************************
// GLobals

var commandHistory = [""];
var commandPointer = 0;
var commandInsertPointer = -1;

// ************************************************************************************************

Firebug.CommandLine = extend(Firebug.Module,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    // targetWindow was needed by evaluateInSandbox, let's leave it for a while in case we rethink this yet again

    evaluate: function(expr, context, thisValue, targetWindow, successConsoleFunction, exceptionFunction) // returns user-level wrapped object I guess.
    {
        if (!context)
            return;

        var result = null;

        if (context.stopped)
        {
            result = this.evaluateInDebugFrame(expr, context, thisValue, targetWindow,  successConsoleFunction, exceptionFunction);
        }
        else
        {
            result = this.evaluateByEventPassing(expr, context, thisValue, targetWindow,  successConsoleFunction, exceptionFunction);
        }

        return result;
    },


    evaluateByEventPassing: function(expr, context, thisValue, targetWindow, successConsoleFunction, exceptionFunction)
    {
        var win = targetWindow ? targetWindow : ( context.baseWindow ? context.baseWindow : context.window );
        if (!win)
        {
            if (FBTrace.DBG_ERRORS) FBTrace.dumpStack("commandLine.evaluateByEventPassing: no targetWindow!\n");
            return;
        }

        var element = win.document.getElementById("_firebugConsole");
        if (!element)
        {
            Firebug.Console.injector.attachConsole(context, win);
            var element = win.document.getElementById("_firebugConsole");
        }
        if (!element)
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("commandLine.evaluateByEventPassing: no _firebugConsole!\n");
            return;  // we're in trouble here.
        }

        // Make sure the command line script is attached.
        if (win.wrappedJSObject && !win.wrappedJSObject._FirebugCommandLine)
            Firebug.CommandLine.injector.attachCommandLine(context, win);

        var event = document.createEvent("Events");
        event.initEvent("firebugCommandLine", true, false);
        element.setAttribute("methodName", "evaluate");

        expr = expr.toString();
        expr = "with(_FirebugCommandLine){" + expr + "};";
        element.setAttribute("expr", expr);

        var consoleHandler;
        for (var i=0; i<context.consoleHandler.length; i++)
        {
            if (context.consoleHandler[i].window == win)
            {
                consoleHandler = context.consoleHandler[i].handler;
                break;
            }
        }

        consoleHandler.evaluated = function useConsoleFunction(result)
        {
            successConsoleFunction(result, context);  // result will be pass thru this function
        }

        if (exceptionFunction)
        {
            consoleHandler.evaluateError = function useExceptionFunction(result)
            {
                exceptionFunction(result, context);
            }
        }
        else
        {
            consoleHandler.evaluateError = function useErrorFunction(result)
            {
                var m = reCmdSource.exec(result.source);
                if (m.length > 0)
                    result.source = m[1];

                Firebug.Console.logFormatted([result], context, "error", true);
            }
        }

        element.dispatchEvent(event);
    },

    evaluateInDebugFrame: function(expr, context, thisValue, targetWindow,  successConsoleFunction, exceptionFunction)
    {
        var result = null;

        if (!context.commandLineAPI)
            context.commandLineAPI = new FirebugCommandLineAPI(context, context.window);

        var scope = {
            api       : context.commandLineAPI,
            vars      : getInspectorVars(context),
            thisValue : thisValue
        };

        try
        {
            result = Firebug.Debugger.evaluate(expr, context, scope);
            successConsoleFunction(result, context);  // result will be pass thru this function
        }
        catch (e)
        {
            exceptionFunction(e, context);
        }
        return result;
    },

    // TODO: strip down to minimum, have one global sandbox that is reused.
    evaluateInSandbox: function(expr, context, thisValue, targetWindow, skipNotDefinedMessages)  // returns user-level wrapped object I guess.
    {
        // targetWindow may be frame in HTML
        var win = targetWindow ? targetWindow : ( context.baseWindow ? context.baseWindow : context.window );

        if (!context.sandboxes)
            context.sandboxes = [];

        var sandbox = this.getSandboxByWindow(context, win);
        if (!sandbox)
        {
            sandbox = new Components.utils.Sandbox(win); // Use DOM Window
            sandbox.__proto__ = win.wrappedJSObject;
            context.sandboxes.push(sandbox); // XXXdolske does this get cleared?  LEAK?
        }

        var scriptToEval = expr;

        // If we want to use a specific |this|, wrap the expression with Function.apply()
        // and inject the new |this| into the sandbox so it's easily accessible.
        if (thisValue) {
            // XXXdolske is this safe if we're recycling the sandbox?
            sandbox.__thisValue__ = thisValue;
            scriptToEval = "(function() { return " + scriptToEval + " \n}).apply(__thisValue__);";
        }

        // Page scripts expect |window| to be the global object, not the
        // sandbox object itself. Stick window into the scope chain so
        // assignments like |foo = bar| are effectively |window.foo =
        // bar|, else the page won't see the new value.
        scriptToEval = "with (window?window:null) { " + scriptToEval + " \n};";

        try {
            result = Components.utils.evalInSandbox(scriptToEval, sandbox);
        } catch (e) {
            if (FBTrace.DBG_ERRORS) FBTrace.dumpProperties("commandLine.evaluate FAILED:", e);  /*@explore*/
            result = new FBL.ErrorMessage("commandLine.evaluate FAILED: " + e, this.getDataURLForContent(scriptToEval, "FirebugCommandLineEvaluate"), e.lineNumber, 0, "js", context, null);
        }
        return result;
    },

    getSandboxByWindow: function(context, win)
    {
        for (var i = 0; i < context.sandboxes.length; i++) {
            // XXXdolske is accessing .window safe after untrusted script has run?
            if (context.sandboxes[i].window === win.wrappedJSObject)
                return context.sandboxes[i];
        }
        return null;
    },

    getDataURLForContent: function(content, url)
    {
        // data:text/javascript;fileName=x%2Cy.js;baseLineNumber=10,<the-url-encoded-data>
        var uri = "data:text/html;";
        uri += "fileName="+encodeURIComponent(url)+ ","
        uri += encodeURIComponent(content);
        return uri;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    enter: function(context, command)
    {
        var commandLine = getCommandLine(context);
        var expr = command ? command : commandLine.value;
        if (expr == "")
            return;

        if (!Firebug.largeCommandLine)
        {
            this.clear(context);
            this.appendToHistory(expr);

            Firebug.Console.log(commandPrefix + " " + expr, context, "command", FirebugReps.Text);
        }
        else
        {
            var shortExpr = cropString(stripNewLines(expr), 100);
            Firebug.Console.log(commandPrefix + " " + shortExpr, context, "command", FirebugReps.Text);
        }

        this.evaluate(expr, context, null, context.window, FBL.bind(Firebug.Console.log, Firebug.Console)); // XXXjjb targetWindow??
    },

    enterMenu: function(context)
    {
        var commandLine = getCommandLine(context);
        var expr = commandLine.value;
        if (expr == "")
            return;

        this.appendToHistory(expr, true);

        this.evaluate(expr, context, null, context.window, function(result, context)
        {
            if (typeof(result) != "undefined")
            {
                context.chrome.contextMenuObject = result;

                var popup = context.chrome.$("fbContextMenu");
                popup.showPopup(commandLine, -1, -1, "popup", "bottomleft", "topleft");
            }
        });
    },

    enterInspect: function(context)
    {
        var commandLine = getCommandLine(context);
        var expr = commandLine.value;
        if (expr == "")
            return;

        this.clear(context);
        this.appendToHistory(expr);

        this.evaluate(expr, context, null, context.window, function(result, context)
        {
            if (typeof(result) != undefined)
                context.chrome.select(result);
        });
    },

    reenter: function(context)
    {
        var command = commandHistory[commandInsertPointer];
        if (command)
            this.enter(context, command);
    },

    copyBookmarklet: function(context)
    {
        var commandLine = getCommandLine(context);
        var expr = "javascript: " + stripNewLines(commandLine.value);
        copyToClipboard(expr);
    },

    focus: function(context)
    {
        if (context.detached)
            context.chrome.focus();
        else
            Firebug.toggleBar(true);

        context.chrome.selectPanel("console");

        var commandLine = getCommandLine(context);
        setTimeout(function() { commandLine.select(); });
    },

    clear: function(context)
    {
        var commandLine = getCommandLine(context);
        commandLine.value = context.commandLineText = "";
        this.autoCompleter.reset();
    },

    cancel: function(context)
    {
        var commandLine = getCommandLine(context);
        if (!this.autoCompleter.revert(commandLine))
            this.clear(context);
    },

    update: function(context)
    {
        var commandLine = getCommandLine(context);
        context.commandLineText = commandLine.value;
        this.autoCompleter.reset();
    },

    complete: function(context, reverse)
    {
        var commandLine = getCommandLine(context);
        this.autoCompleter.complete(context, commandLine, true, reverse);
        context.commandLineText = commandLine.value;
    },

    setMultiLine: function(multiLine)
    {
        if (FirebugContext && FirebugContext.panelName != "console")
            return;

        var chrome = FirebugContext ? FirebugContext.chrome : FirebugChrome;
        chrome.$("fbCommandBox").collapsed = multiLine;
        chrome.$("fbPanelSplitter").collapsed = !multiLine;
        chrome.$("fbSidePanelDeck").collapsed = !multiLine;
        if (multiLine)
            chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbLargeCommandBox");

        var commandLineSmall = chrome.$("fbCommandLine");
        var commandLineLarge = chrome.$("fbLargeCommandLine");

        if (multiLine)
            commandLineLarge.value = cleanIndentation(commandLineSmall.value);
        else
            commandLineSmall.value = stripNewLines(commandLineLarge.value);
    },

    toggleMultiLine: function(forceLarge)
    {
        var large = forceLarge || !Firebug.largeCommandLine;
        if (large != Firebug.largeCommandLine)
            Firebug.setPref(Firebug.prefDomain, "largeCommandLine", large);
    },

    checkOverflow: function(context)
    {
        if (!context)
            return;

        var commandLine = getCommandLine(context);
        if (commandLine.value.indexOf("\n") >= 0)
        {
            setTimeout(bindFixed(function()
            {
                Firebug.setPref(Firebug.prefDomain, "largeCommandLine", true);
            }, this));
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    appendToHistory: function(command, unique)
    {
        if (unique && commandHistory[commandInsertPointer] == command)
            return;

        ++commandInsertPointer;
        if (commandInsertPointer >= commandHistoryMax)
            commandInsertPointer = 0;

        commandPointer = commandInsertPointer+1;
        commandHistory[commandInsertPointer] = command;
    },

    cycleCommandHistory: function(context, dir)
    {
        var commandLine = getCommandLine(context);

        commandHistory[commandPointer] = commandLine.value;

        if (dir < 0)
        {
            --commandPointer;
            if (commandPointer < 0)
                commandPointer = 0;
        }
        else
        {
            ++commandPointer;
            if (commandPointer > commandInsertPointer+1)
                commandPointer = commandInsertPointer+1;
        }

        var command = commandHistory[commandPointer];

        this.autoCompleter.reset();

        commandLine.value = context.commandLineText = command;
        commandLine.inputField.setSelectionRange(command.length, command.length);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        this.autoCompleter = new Firebug.AutoCompleter(getExpressionOffset, getDot,
            autoCompleteEval, false, true);

        if (Firebug.largeCommandLine)
            this.setMultiLine(true);
    },

    showContext: function(browser, context)
    {
        if (context)  // null for eg about:crashes
        {
            var chrome = context ? context.chrome : FirebugChrome;
            if (chrome)
            {
                var command = chrome.$("cmd_focusCommandLine");
                command.setAttribute("disabled", !context);
            }
        }
    },

    showPanel: function(browser, panel)
    {
        var chrome = browser.chrome;

        var isConsole = panel && panel.name == "console";
        if (Firebug.largeCommandLine)
        {
            if (isConsole)
            {
                chrome.$("fbPanelSplitter").collapsed = false;
                chrome.$("fbSidePanelDeck").collapsed = false;
                chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbLargeCommandBox");
                collapse(chrome.$("fbCommandBox"), true);
            }
        }
        else
            collapse(chrome.$("fbCommandBox"), !isConsole);

        var value = panel ? panel.context.commandLineText : null;
        var commandLine = getCommandLine(browser);
        commandLine.value = value ? value : "";
    },

    updateOption: function(name, value)
    {
        if (name == "largeCommandLine")
            this.setMultiLine(value);
    }
});

// ************************************************************************************************
// Shared Helpers

Firebug.CommandLine.CommandHandler = extend(Object,
{
    handle: function(event, scope, win)
    {
        var element = event.target;
        var methodName = element.getAttribute("methodName");
        var hosed_userObjects = win.wrappedJSObject._firebug.userObjects;

        var userObjects = cloneArray(hosed_userObjects);
        if (FBTrace.DBG_CONSOLE)                                                                                                    /*@explore*/
            FBTrace.dumpProperties("FirebugConsoleHandler: userObjects",  userObjects);                                             /*@explore*/

        var subHandler = scope[methodName];
        if (!subHandler)
            return false;

        element.removeAttribute("retValueType");
        var result = subHandler.apply(scope, userObjects);
        if (typeof result != "undefined")
        {
            if (result instanceof Array)
            {
                element.setAttribute("retValueType", "array");
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

// ************************************************************************************************
// Local Helpers

function getExpressionOffset(command, offset)
{
    // XXXjoe This is kind of a poor-man's JavaScript parser - trying
    // to find the start of the expression that the cursor is inside.
    // Not 100% fool proof, but hey...

    var bracketCount = 0;

    var start = command.length-1;
    for (; start >= 0; --start)
    {
        var c = command[start];
        if ((c == "," || c == ";" || c == " ") && !bracketCount)
            break;
        if (reOpenBracket.test(c))
        {
            if (bracketCount)
                --bracketCount;
            else
                break;
        }
        else if (reCloseBracket.test(c))
            ++bracketCount;
    }

    return start + 1;
}

function getDot(expr, offset)
{
    var lastDot = expr.lastIndexOf(".");
    if (lastDot == -1)
        return null;
    else
        return {start: lastDot+1, end: expr.length-1};
}

function autoCompleteEval(preExpr, expr, postExpr, context)
{
    try
    {
        if (preExpr)
        {
            // Remove the trailing dot (if there is one)
            var lastDot = preExpr.lastIndexOf(".");
            if (lastDot != -1)
                preExpr = preExpr.substr(0, lastDot);

            var self = this;
            Firebug.CommandLine.evaluate(preExpr, context, context.thisValue, context.window,
                function found(result, context)
                {
                    self.complete = keys(result).sort();
                },
                function failed(result, context)
                {
                    self.complete = [];
                }
            );
            return self.complete;
        }
        else
        {
            if (context.stopped)
                return Firebug.Debugger.getCurrentFrameKeys(context);
            else
                return keys(context.window.wrappedJSObject).sort();  // return is safe
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS) /*@explore*/
            FBTrace.dumpProperties("commandLine.autoCompleteEval FAILED", exc); /*@explore*/
        return [];
    }
}

function injectScript(script, win)
{
    win.location = "javascript: " + script;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function getInspectorVars(context)
{
    var htmlPanel = context.getPanel("html", true);
    var vars = {};
    for (var i=0; i<2; i++)
        vars["$"+i] = htmlPanel ? htmlPanel.inspectorHistory[i] : null;

    return vars;
}

function getCommandLine(context)
{
    return Firebug.largeCommandLine
        ? context.chrome.$("fbLargeCommandLine")
        : context.chrome.$("fbCommandLine");
}

const reIndent = /^(\s+)/;

function getIndent(line)
{
    var m = reIndent.exec(line);
    return m ? m[0].length : 0;
}

function cleanIndentation(text)
{
    var lines = splitLines(text);

    var minIndent = -1;
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];
        var indent = getIndent(line);
        if (minIndent == -1 && line && !isWhitespace(line))
            minIndent = indent;
        if (indent >= minIndent)
            lines[i] = line.substr(minIndent);
    }
    return lines.join("\n");
}

// ************************************************************************************************
// Command line APIs definition

function FirebugCommandLineAPI(context, baseWindow)
{
    this.$ = function(id)
    {
        var doc = baseWindow.document;
        return baseWindow.document.getElementById(id);
    };

    this.$$ = function(selector)
    {
        return FBL.getElementsBySelector(baseWindow.document, selector);
    };

    this.$x = function(xpath)
    {
        return FBL.getElementsByXPath(baseWindow.document, xpath);
    };

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

        return node.wrappedJSObject;
    };

    this.cd = function(object)
    {
        if (object instanceof Window)
            baseWindow = context.baseWindow = object;
        else
            throw "Object must be a window.";
    };

    this.clear = function()
    {
        Firebug.Console.clear(context);
    };

    this.inspect = function(obj, panelName)
    {
        context.chrome.select(obj, panelName);
    };

    this.keys = function(o)
    {
        return FBL.keys(o);
    };

    this.values = function(o)
    {
        return FBL.values(o);
    };

    this.debug = function(fn)
    {
        Firebug.Debugger.trace(fn, null, "debug");
    };

    this.undebug = function(fn)
    {
        Firebug.Debugger.untrace(fn, null, "debug");
    };

    this.monitor = function(fn)
    {
        Firebug.Debugger.trace(fn, null, "monitor");
    };

    this.unmonitor = function(fn)
    {
        Firebug.Debugger.untrace(fn, null, "monitor");
    };

    this.monitorEvents = function(object, types)
    {
        monitorEvents(object, types, context);
    };

    this.unmonitorEvents = function(object, types)
    {
        unmonitorEvents(object, types, context);
    };

    this.profile = function(title)
    {
        Firebug.Profiler.startProfiling(context, title);
    };

    this.profileEnd = function()
    {
        Firebug.Profiler.stopProfiling(context);
    };

    this.copy = function(x)
    {
        FBL.copyToClipboard(x);
    };
}

// ************************************************************************************************

Firebug.CommandLine.injector = {

    attachCommandLine: function(context, win)
    {
        if (!win)
            return;

        // If the command line is already attached then end.
        var doc = win.document;
        if ($("_firebugCommandLineInjector", doc))
            return;

        if (context.stopped)
            Firebug.CommandLine.injector.evalCommandLineScript(context);
        else
            Firebug.CommandLine.injector.injectCommandLineScript(doc);

        Firebug.CommandLine.injector.addCommandLineListener(context, win, doc);
    },

    evalCommandLineScript: function(context)
    {
        var scriptSource = getResource("chrome://firebug/content/commandLineInjected.js");
        Firebug.Debugger.evaluate(scriptSource, context);
    },

    injectCommandLineScript: function(doc)
    {
        // Inject command line script into the page.
        var scriptSource = getResource("chrome://firebug/content/commandLineInjected.js");
        addScript(doc, "_firebugCommandLineInjector", scriptSource);
    },

    addCommandLineListener: function(context, win, doc)
    {
        // Register listener for command-line execution events.
        var handler = new CommandLineHandler(context, win);
        var element = $("_firebugConsole", doc);
        if (element)
        {
            element.addEventListener("firebugExecuteCommand", bind(handler.handleEvent, handler) , true);
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Commandline.injector, no _firebugConsole element " + win.location + "\n");
        }
    }
};

function CommandLineHandler(context, win)
{
    this.handleEvent = function(event)
    {
        var scope = new FirebugCommandLineAPI(context, context.window.wrappedJSObject);

        // Appends variables into the scope.
        var vars = getInspectorVars(context);
        for (var prop in vars)
        {
            function createHandler(p) {
                return function() {
                    if (FBTrace.DBG_CONSOLE)
                        FBTrace.dumpProperties("commandline.getInspectorHistory: " + p, vars);
                    return vars[p] ? vars[p].wrappedJSObject : null;
                }
            }
            scope[prop] = createHandler(prop);
        }

        if (FBTrace.DBG_CONSOLE)
            FBTrace.dumpProperties("commandline.handleEvent('firebugExecuteCommand'): ", scope);

        if (!Firebug.CommandLine.CommandHandler.handle(event, scope, win))
        {
            var methodName = event.target.getAttribute("methodName");
            Firebug.Console.log($STRF("commandline.MethodNotSupported", [methodName]));
        }
    };
}

// ************************************************************************************************

Firebug.registerModule(Firebug.CommandLine);

// ************************************************************************************************

}});
