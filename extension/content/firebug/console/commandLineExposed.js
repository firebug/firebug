/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, evil:true, forin: false*/
/*global Firebug:true, FBTrace:true, Components:true, define:true */

define([
    "firebug/lib/wrapper",
    "firebug/debugger/debuggerLib",
    "firebug/lib/object",
    "firebug/console/commandLineAPI",
    "firebug/lib/locale",
],
function(Wrapper, DebuggerLib, Obj, CommandLineAPI, Locale) {
"use strict";

// ********************************************************************************************* //
// Constants

const Cu = Components.utils;

// ********************************************************************************************* //
// Command Line APIs

// List of command line APIs
var commandNames = ["$", "$$", "$n", "$x", "cd", "clear", "inspect", "keys",
    "values", "debug", "undebug", "monitor", "unmonitor", "traceCalls", "untraceCalls",
    "traceAll", "untraceAll", "copy"];

// List of shortcuts for some console methods
var consoleShortcuts = ["dir", "dirxml", "table"];

// List of console variables.
var props = ["$0", "$1", "$2", "$3", "$4"];

// Registered commands, name -> config object.
var userCommands = Object.create(null);

// List of command line APIs to auto-complete, kept equal to the concatenation
// of the above minus trace*.
var completionList = [
    "$", "$$", "$n", "$x", "cd", "clear", "inspect", "keys",
    "values", "debug", "undebug", "monitor", "unmonitor", "copy"
].concat(consoleShortcuts, props);
var unsortedCompletionList = true;

// ********************************************************************************************* //
// Command Line Implementation

/**
 * Returns a command line object (bundled with passed window through closure). The object
 * provides all necessary APIs as described here:
 * http://getfirebug.com/wiki/index.php/Command_Line_API
 *
 * @param {Object} context
 * @param {Object} win
 */
function createFirebugCommandLine(context, win)
{
    var contentView = Wrapper.getContentView(win);
    if (!contentView)
    {
        if (FBTrace.DBG_COMMANDLINE || FBTrace.DBG_ERRORS)
            FBTrace.sysout("createFirebugCommandLine ERROR no contentView " + context.getName());

        return null;
    }

    // The debuggee global.
    var dglobal = DebuggerLib.getDebuggeeGlobal(context, win);

    if (!context.commandLineCache)
        context.commandLineCache = new WeakMap();
    var commandLineCache = context.commandLineCache;

    var commandLine = commandLineCache.get(win.document);
    if (commandLine)
        return copyCommandLine(commandLine, dglobal);

    // The commandLine object.
    commandLine = dglobal.makeDebuggeeValue(Object.create(null));

    var console = Firebug.ConsoleExposed.createFirebugConsole(context, win);
    // The command line API instance.
    var commands = CommandLineAPI.getCommandLineAPI(context);

    // Helpers for command creation.
    function createCommandHandler(command)
    {
        var wrappedCommand = function()
        {
            try
            {
                return command.apply(null, arguments);
            }
            catch(ex)
            {
                throw new Error(ex.message, ex.fileName, ex.lineNumber);
            }
        };
        return dglobal.makeDebuggeeValue(wrappedCommand);
    }

    function createVariableHandler(handler, config)
    {
        var debuggeeObj = {}, object;

        // Callable getters are commands whose syntax are both `command` and `command()`.
        // The help command has this syntax for example.
        if (config.isCallableGetter === true)
            debuggeeObj = function(){ return object.handle(); };

        object = dglobal.makeDebuggeeValue(debuggeeObj);
        object.handle = function()
        {
            try
            {
                return handler(context);
            }
            catch(ex)
            {
                throw new Error(ex.message, ex.fileName, ex.lineNumber);
            }
        };
        return object;
    }

    function createUserCommandHandler(config)
    {
        return function()
        {
            try
            {
                return config.handler.call(null, context, arguments);
            }
            catch(ex)
            {
                throw new Error(ex.message, ex.fileName, ex.lineNumber);
            }
        };
    }

    // Define command line methods.
    for (var commandName in commands)
    {
        var command = commands[commandName];
        commandLine[commandName] = createCommandHandler(command);
    }

    // Register shortcut.
    consoleShortcuts.forEach(function(name)
    {
        var command = console[name].bind(console);
        commandLine[name] = createCommandHandler(command);
    });

    // Register user commands.
    for (var name in userCommands)
    {
        var config = userCommands[name];
        var command = createUserCommandHandler(config, name);
        if (userCommands[name].getter)
            commandLine[name] = createVariableHandler(command, config);
        else
            commandLine[name] = createCommandHandler(command);
    }

    commandLineCache.set(win.document, commandLine);

    // Return a copy so the original one is preserved from changes.
    return copyCommandLine(commandLine, dglobal);
}

// ********************************************************************************************* //
// User Commands

/**
 * Registers a command.
 *
 * @param {string} name The name of the command
 * @param {object} config The configuration. See some examples in commandLineHelp.js 
 *      and commandLineInclude.js
 */
function registerCommand(name, config)
{
    if (commandNames[name] || consoleShortcuts[name] || props[name] || userCommands[name])
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("firebug.registerCommand; ERROR This command is already " +
                "registered: " + name);
        }

        return false;
    }

    userCommands[name] = config;
    completionList.push(name);
    unsortedCompletionList = true;
    return true;
}

/**
 * Unregisters a command.
 *
 * @param {string} name The name of the command to unregister
 */
function unregisterCommand(name)
{
    if (!userCommands[name])
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("firebug.unregisterCommand; ERROR This command is not " +
                "registered: " + name);
        }

        return false;
    }

    delete userCommands[name];
    var ind = completionList.indexOf(name);
    if (ind !== -1)
        completionList.splice(ind, 1);
    return true;
}

/**
 * Evaluates an expression in the thread of the webpage, so the Firebug UI is not frozen
 * when the expression calls a function which will be paused.
 *
 *
 * @param {object} context
 * @param {Window} win
 * @param {string} expr The expression (transformed if needed)
 * @param {string} origExpr The expression as typed by the user
 * @param {function} onSuccess The function to trigger in case of success
 * @param {function} onError The function to trigger in case of exception
 * @param {object} [options] The options (see CommandLine.evaluateInGlobal for the details)
 *
 * @see CommandLine.evaluate
 */
function evaluateInPageContext(context, win)
{
    executeInWindowContext(win, evaluate, arguments);
}

/**
 * Evaluates an expression.
 *
 * @param {object} context
 * @param {Window} win
 * @param {string} expr The expression (transformed if needed)
 * @param {string} origExpr The expression as typed by the user
 * @param {function} onSuccess The function to trigger in case of success
 * @param {function} onError The function to trigger in case of exception
 * @param {object} [options] The options (see CommandLine.evaluateInGlobal for the details)
 */
function evaluate(context, win, expr, origExpr, onSuccess, onError, options)
{
    if (!options)
        options = {};

    var result;
    var contentView = Wrapper.getContentView(win);
    var dglobal = DebuggerLib.getDebuggeeGlobal(context, win);
    var resObj;

    if (!options.noCmdLineAPI)
    {
        var bindings = getCommandLineBindings(context, win, dglobal, contentView);

        resObj = dglobal.evalInGlobalWithBindings(expr, bindings);
    }
    else
    {
        resObj = dglobal.evalInGlobal(expr);
    }


    // In case of abnormal termination, as if by the "slow script" dialog box,
    // do not print anything in the console.
    if (!resObj)
    {
        if (FBTrace.DBG_ERROR)
            FBTrace.sysout("CommandLineExposed.evaluate; something went wrong when evaluating this"+
                " expression: "+expr);
        return;
    }

    if (resObj.hasOwnProperty("return"))
    {
        result = DebuggerLib.unwrapDebuggeeValue(resObj.return);
        if (resObj.return && resObj.return.handle)
        {
            resObj.return.handle();
            // Do not print anything in the console in case of getter commands.
            return;
        }
    }
    else if (resObj.hasOwnProperty("yield"))
    {
        result = DebuggerLib.unwrapDebuggeeValue(resObj.yield);
    }
    else if (resObj.hasOwnProperty("throw"))
    {
        var exc = DebuggerLib.unwrapDebuggeeValue(resObj.throw);
        handleException(exc, origExpr, context, onError);
        return;
    }

    executeInWindowContext(window, onSuccess, [result, context]);
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// Helpers (not accessible from web content)

function copyCommandLine(commandLine, dglobal)
{
    var copy = dglobal.makeDebuggeeValue(Object.create(null));
    for (var name in commandLine)
        copy[name] = commandLine[name];
    return copy;
}

function findLineNumberInExceptionStack(splitStack)
{
    var m = splitStack[0].match(/:(\d+)$/);
    return m !== null ? +m[1] : null;
}

function correctStackTrace(splitStack)
{
    var filename = Components.stack.filename;
    // remove the frames over the evaluated expression
    for (var i = 0; i < splitStack.length-1 &&
        splitStack[i+1].indexOf(evaluate.name + "@" + filename, 0) === -1 ; i++);

    if (i >= splitStack.length)
        return false;
    splitStack.splice(0, i);
    return true;
}

function updateVars(commandLine, dglobal, context)
{
    var htmlPanel = context.getPanel("html", true);
    var vars = htmlPanel ? htmlPanel.getInspectorVars() : null;

    for (var prop in vars)
        commandLine[prop] = dglobal.makeDebuggeeValue(vars[prop]);

    // Iterate all registered commands and pick those which represents a 'variable'.
    // These needs to be available as variables within the Command Line namespace.
    for (var prop in userCommands)
    {
        var cmd = userCommands[prop];
        if (cmd.variable)
        {
            var value = cmd.handler.call(null, context);
            commandLine[prop] = dglobal.makeDebuggeeValue(value);
        }
    }
}

function removeConflictingNames(commandLine, context, contentView)
{
    for (var name in commandLine)
    {
        // Note: we cannot trust contentView.hasOwnProperty, so we use the "in" operator.
        if (name in contentView)
            delete commandLine[name];
    }
}

function handleException(exc, origExpr, context, onError)
{
    // Change source and line number of exceptions from commandline code
    // create new error since properties of nsIXPCException are not modifiable.
    // Example of code raising nsIXPCException: `alert({toString: function(){ throw "blah"; }})`

    // xxxFlorent: FIXME: we can't get the right stack trace with this example:
    //     function a(){
    //          throw new Error("error");
    //     }
    //     <ENTER>
    //     a();
    //     <ENTER>

    if (exc === null || exc === undefined)
        return;

    if (typeof exc !== "object")
    {
        exc = new Error(exc, null, null);
        exc.fileName = exc.lineNumber = exc.stack = null;
    }

    var shouldModify = false, isXPCException = false;
    var fileName = exc.filename || exc.fileName || "";
    var isInternalError = fileName.lastIndexOf("chrome://", 0) === 0;
    var lineNumber = null;
    var stack = null;
    var splitStack;
    var isFileNameMasked = DebuggerLib.isFrameLocationEval(fileName);
    if (isInternalError || isFileNameMasked)
    {
        shouldModify = true;
        isXPCException = (exc.filename !== undefined);

        // Lie and show the pre-transformed expression instead.
        fileName = "data:,/* " + Locale.$STR("commandline.errorSourceHeader") + " */"+
            encodeURIComponent("\n"+origExpr);

        if (isInternalError && typeof exc.stack === "string")
        {
            splitStack = exc.stack.split("\n");
            var correctionSucceeded = correctStackTrace(splitStack);
            if (correctionSucceeded)
            {
                // correct the line number so we take into account the comment prepended above
                lineNumber = findLineNumberInExceptionStack(splitStack) + 1;

                // correct the first trace
                splitStack.splice(0, 1, "@" + fileName + ":" + lineNumber);
                stack = splitStack.join("\n");
            }
            else
                shouldModify = false;
        }
        else
        {
            // correct the line number so we take into account the comment prepended above
            lineNumber = exc.lineNumber + 1;
        }
    }

    var result = new Error();

    if (shouldModify)
    {
        result.stack = stack;
        result.source = origExpr;
        result.message = exc.message;
        result.lineNumber = lineNumber;
        result.fileName = fileName;

        // The error message can also contain post-transform details about the
        // source, but it's harder to lie about. Make it prettier, at least.
        if (typeof result.message === "string")
            result.message = result.message.replace(/__fb_scopedVars\(/g, "<get closure>(");

        if (!isXPCException)
            result.name = exc.name;
    }
    else
    {
        Obj.getPropertyNames(exc).forEach(function(prop)
        {
            result[prop] = exc[prop];
        });
        result.stack = exc.stack;
        result.source = exc.source;
    }

    executeInWindowContext(window, onError, [result, context]);
}

/**
 * Executes a function in another window execution context.
 *
 * Useful when we have to pause some debuggee functions without freezing
 * the Firebug UI.
 *
 * @param {Window} win The window having the thread in which we want to execute the function
 * @param {function} func The function to execute
 * @param {Array or Array-Like object} args The arguments to pass to the function
 */
function executeInWindowContext(win, func, args)
{
    var listener = function()
    {
        win.document.removeEventListener("firebugCommandLine", listener);
        func.apply(null, args);
    };
    win.document.addEventListener("firebugCommandLine", listener);
    var event = document.createEvent("Events");
    event.initEvent("firebugCommandLine", true, false);
    win.document.dispatchEvent(event);
}

function getAutoCompletionList()
{
    if (unsortedCompletionList)
    {
        unsortedCompletionList = false;
        completionList.sort();
    }
    return completionList;
}

function getCommandLineBindings(context, win, dglobal, contentView)
{
    var commandLine = createFirebugCommandLine(context, win);

    updateVars(commandLine, dglobal, context);
    removeConflictingNames(commandLine, context, contentView);

    return commandLine;
}

// ********************************************************************************************* //
// Registration

Firebug.CommandLineExposed =
{
    createFirebugCommandLine: createFirebugCommandLine,
    commands: commandNames,
    consoleShortcuts: consoleShortcuts,
    properties: props,
    userCommands: userCommands,
    registerCommand: registerCommand,
    unregisterCommand: unregisterCommand,
    evaluate: evaluateInPageContext,
    getAutoCompletionList: getAutoCompletionList,
};

return Firebug.CommandLineExposed;

// ********************************************************************************************* //
});
