/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const commandHistoryMax = 1000;
const commandPrefix = ">>>";

const reOpenBracket = /[\[\(\{]/;
const reCloseBracket = /[\]\)\}]/;

// XXXjjb FF3  needs win.__scope__ because we eval in sandbox

const evalScript = "with (win.__scope__.vars) { with (win.__scope__.api) { with (win.__scope__.userVars) { with (win) {" +
    "try {" +
        "win.__scope__.callback(eval(win.__scope__.expr));" +
    "} catch (exc) {" +
        "win.__scope__.callback(exc, true);" +
    "}" +
"}}}}";

const evalScriptWithThis =  "(function() { " + evalScript + " }).apply(win.__scope__.thisValue);";

// ************************************************************************************************
// GLobals

var commandHistory = [""];
var commandPointer = 0;
var commandInsertPointer = -1;

// ************************************************************************************************

Firebug.CommandLine = extend(Firebug.Module,
{
    // Used externally to detect command line stack frames
    evalScript: evalScript,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    evaluate: function(expr, context, userVars, thisValue)
    {
        if (!context)
            return;

        var result = null;
        var threw = false;

        if (!context.commandLineAPI)
            context.commandLineAPI = new FirebugCommandLineAPI(context);

        var scope =
        {
            api: context.commandLineAPI,
            vars: getInspectorVars(context),
            userVars: userVars ? userVars : {},
            thisValue: thisValue
        };

        var scriptToEval = thisValue ? evalScriptWithThis : evalScript;

        if (context.stopped)
        {
            result = Firebug.Debugger.evaluate(expr, context, scope);
        }
        else
        {
            var win = context.baseWindow ? context.baseWindow : context.window;
            var fullScope = extend(scope,
            {
                expr: expr,
                callback: function(value, hadException) { result = value; threw = hadException; }
            });

            iterateWindows(win, function(win) { win.__scope__ = fullScope; });

            try
            {
                FBL.evalInTo(win, scriptToEval);
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS) FBTrace.dumpProperties("commandLine.evaluate FBL.evalInTo FAILS:",exc);        /*@explore*/
				result = new FBL.ErrorMessage("commandLing.evaluate FAILS: "+exc, "command line failure",0, 0, "js", context, null);
            }
            try
            {
                 iterateWindows(win, function(win) { delete win.__scope__; });
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS) FBTrace.dumpProperties("commandLine.evaluate iterateWindows to delete FAILS:", exc);          /*@explore*/
				throw exc;
            }
			if (threw)
            {
                if (FBTrace.DBG_ERRORS) FBTrace.dumpProperties("commandLine.evaluate evaluation threw:", result);          /*@explore*/
				result = new FBL.ErrorMessage(result.message, "command line",0, 0, "js", context, null);
				if (FBTrace.DBG_ERRORS) FBTrace.dumpProperties("commandLine.evaluate ErrorMessage result:", result);          /*@explore*/
            }
        }

        context.invalidatePanels("dom", "watches", "domSide");

        return result;
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

        var result = this.evaluate(expr, context);
        if (typeof(result)  != "undefined")
            Firebug.Console.log(result, context);
    },

    enterMenu: function(context)
    {
        var commandLine = getCommandLine(context);
        var expr = commandLine.value;
        if (expr == "")
            return;

        this.appendToHistory(expr, true);

        var result = this.evaluate(expr, context);
        if (typeof(result) != "undefined")
        {
            context.chrome.contextMenuObject = result;

            var popup = context.chrome.$("fbContextMenu");
            popup.showPopup(commandLine, -1, -1, "popup", "bottomleft", "topleft");
        }
    },

    enterInspect: function(context)
    {
        var commandLine = getCommandLine(context);
        var expr = commandLine.value;
        if (expr == "")
            return;

        this.clear(context);
        this.appendToHistory(expr);

        var result = this.evaluate(expr, context);
        if (typeof(result) != undefined)
            context.chrome.select(result);
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
            Firebug.setPref("largeCommandLine", large);
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
                Firebug.setPref("largeCommandLine", true);
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
        var chrome = context ? context.chrome : FirebugChrome;
        var command = chrome.$("cmd_focusCommandLine");
        command.setAttribute("disabled", !context);
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

            var object = Firebug.CommandLine.evaluate(preExpr, context, null, context.thisValue);
            return keys(object).sort();
        }
        else
        {
            if (context.stopped)
                return Firebug.Debugger.getCurrentFrameKeys(context);
            else
                return keys(context.window).sort();
        }
    }
    catch (exc)
    {
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
    var domPanel = context.getPanel("dom", true);

    return {
        $0: htmlPanel ? htmlPanel.selection : null,
        $1: htmlPanel ? htmlPanel.selection : null,
        $2: htmlPanel ? htmlPanel.previousSelection : null,
        $$1: domPanel ? domPanel.selection : null,
        $$2: domPanel ? domPanel.previousSelection : null
    };
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

Firebug.registerModule(Firebug.CommandLine);

// ************************************************************************************************

}});
