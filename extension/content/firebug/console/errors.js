/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/xpcom",
    "firebug/console/console",
    "firebug/lib/css",
    "firebug/chrome/window",
    "firebug/lib/array",
    "firebug/lib/string"
],
function(Module, Obj, Firebug, FirebugReps, Xpcom, Console, Css, Win, Arr, Str) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIScriptError = Ci.nsIScriptError;
const nsIConsoleMessage = Ci.nsIConsoleMessage;

const WARNING_FLAG = nsIScriptError.warningFlag;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const urlRe = new RegExp("([^:]*):(//)?([^/]*)");
const reUncaught = /uncaught exception/;
// regular expressions for parsing uncaught exceptions
// see http://lxr.mozilla.org/mozilla/source/js/src/xpconnect/src/xpcexception.cpp#347
// and http://lxr.mozilla.org/mozilla/source/js/src/xpconnect/src/xpcstack.cpp#318
// and http://lxr.mozilla.org/mozilla/source/dom/src/base/nsDOMException.cpp#351
const reException1 = /^(?:uncaught exception: )?\[Exception... "(?!<no message>)([\s\S]+)"  nsresult: "0x\S+ \((.+)\)"  location: "(?:(?:JS|native) frame :: (?!<unknown filename>)(.+) :: .+ :: line (\d+)|<unknown>)"  data: (?:yes|no)\]$/;
const reException2 = /^(?:uncaught exception: )?\[Exception... "(?!<no message>)([\s\S]+)"  code: "\d+" nsresult: "0x\S+ \((.+)\)"  location: "(?:(.+) Line: (\d+)|<unknown>)"\]$/;
const pointlessErrors =
{
    "uncaught exception: Permission denied to call method Location.toString": 1,
    "uncaught exception: Permission denied to get property Window.writeDebug": 1,
    "uncaught exception: Permission denied to get property XULElement.accessKey": 1,
    "this.docShell has no properties": 1,
    "aDocShell.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI has no properties": 1,
    "Deprecated property window.title used. Please use document.title instead.": 1,
    "Key event not available on GTK2:": 1
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

Components.utils["import"]("resource://firebug/firebug-service.js");

const consoleService = Xpcom.CCSV("@mozilla.org/consoleservice;1", "nsIConsoleService");
const domWindowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor)
    .getInterface(Ci.nsIDOMWindowUtils);

const wm = Xpcom.CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");

// ********************************************************************************************* //

var Errors = Firebug.Errors = Obj.extend(Module,
{
    dispatchName: "errors",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    shutdown: function()
    {
        // Make sure the error observer is removed.
        this.stopObserving();

        Module.shutdown.apply(this, arguments);
    },

    initContext: function(context)
    {
        this.clear(context);
    },

    showContext: function(browser, context)
    {
        this.showCount(context ? context.errorCount : 0);
    },

    // called for top window and frames.
    unwatchWindow: function(context, win)
    {
        // If we ever get errors by window from Firefox we can cache by window.
        this.clear(context);
    },

    destroyContext: function(context, persistedState)
    {
        this.showCount(0);

        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS && "initTime" in this)
        {
            var deltaT = new Date().getTime() - this.initTime.getTime();

            FBTrace.sysout("errors.destroyContext sheets: " + Css.totalSheets + " rules: " +
                Css.totalRules + " time: " + deltaT);
        }
    },

    updateOption: function(name, value)
    {
        this.checkEnabled();

        if (name == "showErrorCount")
            this.toggleShowErrorCount();
    },

    toggleShowErrorCount: function()
    {
        this.showContext(null, Firebug.currentContext);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    clear: function(context)
    {
        // reset the UI counter
        this.setCount(context, 0);

        // clear the counts of dropped errors
        delete context.droppedErrors;
    },

    increaseCount: function(context)
    {
        this.setCount(context, context.errorCount + 1);
    },

    setCount: function(context, count)
    {
        context.errorCount = count;

        if (context == Firebug.currentContext)
            this.showCount(context.errorCount);
    },

    showCount: function(errorCount)
    {
        Firebug.StartButton.showCount(errorCount);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Called by Console

    startObserving: function()
    {
        if (this.isObserving)
            return;

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("Errors.startObserving");

        if (consoleService)
            consoleService.registerListener(this);

        this.isObserving = true;
    },

    stopObserving: function()
    {
        if (!this.isObserving)
            return;

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("Errors.stopObserving");

        if (consoleService)
            consoleService.unregisterListener(this);

        this.isObserving = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends consoleListener

    observe: function(object)
    {
        // Make sure the argument is an error object. 'instanceof' also
        // queries the object so e.g. outerWindowID (nsIScriptError2) is available.
        // nsIScriptError2 was merged with nsIScriptError, see
        // https://bugzilla.mozilla.org/show_bug.cgi?id=711721
        if (!(object instanceof Ci.nsIScriptError) ||
            (Ci.nsIScriptError2 && !(object instanceof Ci.nsIScriptError2)))
        {
            return;
        }

        try
        {
            if (window.closed)
                this.stopObserving();

            if (typeof FBTrace == "undefined")
                return;

            if (!FBTrace)
                return;
        }
        catch (exc)
        {
            return;
        }

        try
        {
            this.onConsoleLog(object);
        }
        catch (exc)
        {
            // Errors prior to console init will come out here, eg error message
            // from Firefox startup jjb.
            if (FBTrace.DBG_ERRORLOG)
            {
                FBTrace.sysout("errors.observe FAILS " + exc, exc);
                FBTrace.sysout("errors.observe object " + object, object);
            }
        }
    },

    onConsoleLog: function(object)
    {
        var ScriptError = object instanceof nsIScriptError;
        var ConsoleMessage = object instanceof nsIConsoleMessage;

        // This cannot be pulled in front of the instanceof
        var isWarning = object && object.flags & WARNING_FLAG;
        var CSSParser = object && object.category == "CSS Parser";
        var XPConnect = object && object.category &&
            object.category.split(' ').indexOf("XPConnect") != -1;

        // Some categories say "content javascript" even if they come from chrome space.
        var sourceName = (object && object.sourceName) ? object.sourceName : "";
        if (Str.hasPrefix(sourceName, "chrome:") || Str.hasPrefix(sourceName, "resource:"))
            XPConnect = true;

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe; ScriptError: " + ScriptError +
                ", XPConnect: " + XPConnect + ", sourceName: " + sourceName);

        if (ScriptError && !XPConnect)  // all branches should trace 'object'
        {
            if (FBTrace.DBG_ERRORLOG)
            {
                FBTrace.sysout("errors.observe nsIScriptError: " + object.errorMessage,
                    object);
            }

            // after instanceof
            var context = this.getErrorContext(object);
            if (context)
                return this.logScriptError(context, object, isWarning);

            if (FBTrace.DBG_ERRORLOG)
            {
                FBTrace.sysout("errors.observe nsIScriptError no context! " +
                    object.errorMessage, object);
            }
        }
        else
        {
            if (Firebug.showChromeMessages)
            {
                if (ConsoleMessage)
                {
                    if (FBTrace.DBG_ERRORLOG)
                    {
                        FBTrace.sysout("errors.observe nsIConsoleMessage: " +
                            object.message, object);
                    }

                    var context = this.getErrorContext(object);  // after instanceof
                    if (!context)
                        context = Firebug.currentContext;

                    var msgId = lessTalkMoreAction(context, object, isWarning);
                    if (!msgId)
                        return;

                    if (context)
                    {
                        // Even chrome errors can be nicely formatted in the Console panel
                        this.logScriptError(context, object, isWarning);
                        //Console.log(object.message, context, "consoleMessage",
                        //FirebugReps.Text);
                    }
                }
                else if (object.message)
                {
                    if (FBTrace.DBG_ERRORLOG)
                        FBTrace.sysout("errors.observe object.message:", object);

                    var context = this.getErrorContext(object);

                    if (!context)
                        context = Firebug.currentContext;

                    if (context)
                    {
                        // Even chrome errors can be nicely formatted in the Console panel
                        this.logScriptError(context, object, isWarning);
                        //Console.log(object.message, context, "consoleMessage",
                        //FirebugReps.Text);
                    }
                    else
                    {
                        FBTrace.sysout("errors.observe, no context for message", object);
                    }
                }
                else
                {
                    FBTrace.sysout("errors.observe, no message in object", object);
                }
            }
            else
            {
                if (FBTrace.DBG_ERRORLOG)
                    FBTrace.sysout("errors.observe showChromeMessages off, dropped:", object);
                return;
            }
        }

        if (FBTrace.DBG_ERRORLOG)
        {
            if (context)
            {
                if (context.window)
                {
                    FBTrace.sysout((isWarning?"warning":"error") + " logged to " +
                        context.getName());
                }
                else
                {
                    FBTrace.sysout("errors.observe, context with no window, " +
                        (isWarning?"warning":"error")+" object:", object);

                    FBTrace.sysout("errors.observe, context with no window, context:",
                        context);
                }
            }
            else
            {
                FBTrace.sysout("errors.observe, no context!");
            }
        }
    },

    logScriptError: function(context, object, isWarning)
    {
        if (!context)
            return;

        if (FBTrace.DBG_ERRORLOG)
        {
            FBTrace.sysout("errors.observe logScriptError " +
                (Firebug.errorStackTrace ? "have " : "NO ") +
                (Firebug.showStackTrace ? "show stack trace" : "do not show stack trace ") +
                "errorStackTrace error object:",
                {object: object, errorStackTrace: Firebug.errorStackTrace});
        }

        var category = getBaseCategory(object.category);
        var isJSError = category == "js" && !isWarning;

        // the sourceLine will cause the source to be loaded.
        var error = new FirebugReps.ErrorMessageObj(object.errorMessage, object.sourceName,
            object.lineNumber, object.sourceLine, category, context, null);

        // Display column info only if it isn't zero.
        if (object.columnNumber > 0)
            error.colNumber = object.columnNumber;

        if (checkForException(context, object))
        {
            context = getExceptionContext(context, object);
            correctLineNumbersOnExceptions(object, error);
        }

        if (Firebug.errorStackTrace)
        {
            error.correctWithStackTrace(Firebug.errorStackTrace);
            if (!Firebug.showStackTrace)
                error.trace = null;
        }
        else if (Firebug.showStackTrace && !context.isPanelEnabled("script"))
        {
            error.missingTraceBecauseNoDebugger = true;
        }

        var msgId = lessTalkMoreAction(context, object, isWarning);
        if (!msgId)
            return null;

        // clear global: either we copied it or we don't use it.
        Firebug.errorStackTrace = null;

        if (!isWarning)
            this.increaseCount(context);

        var className = isWarning ? "warningMessage" : "errorMessage";

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe delayed log to " + context.getName());

        // report later to avoid loading sourceS
        context.throttle(this.delayedLogging, this, [msgId, context, error, context, className,
            false, true], true);
    },

    delayedLogging: function()
    {
        var args = Arr.cloneArray(arguments);
        var msgId = args.shift();
        var context = args.shift();
        var row = Console.log.apply(Console, args);
        return row;
    },

    getErrorContext: function(object)
    {
        var url = object.sourceName;

        // If window is not associated bail out to avoid reporting errors that are not
        // page related (issue 4991).
        if (!url && !object.outerWindowID)
        {
            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("errors.getErrorContext; No URL & no outer-window. " +
                    "url: " + url + ", outerWindowID: " + object.outerWindowID, object);
            return null;
        }

        if (url && url.indexOf("://chromebug/") > 0)
            return Firebug.currentContext; // no context for self

        // Correct the error routing in the case that the new window id will work (R10860).
        // Don't pass the current context (issue 4504)
        var errorContext = getExceptionContext(null, object);
        if (errorContext)
            return errorContext;

        var errorContext = null;
        Firebug.connection.eachContext(
            function findContextByURL(context)
            {
                if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
                    FBTrace.sysout("findContextByURL " + context.getName());

                if (!context.window || !context.getWindowLocation())
                    return false;

                // If the error's parent window is available, check if it
                // corresponds to the context.window. If not bail out to avoid
                // error reporting in a wrong window.
                var errorWindow = getErrorWindow(object);
                if (errorWindow && errorWindow != context.window)
                    return false;

                if (FBTrace.DBG_ERRORLOG)
                {
                    FBTrace.sysout("findContextByURL seeking " + url + " in " +
                        (context.loaded ? "loaded" : "not loaded") +
                        " window location: " + context.getWindowLocation().toString());
                }

                if (context.getWindowLocation().toString() == url)
                {
                    if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
                        FBTrace.sysout("findContextByURL found match to context window location");

                    return errorContext = context;
                }
                else
                {
                    if (context.sourceFileMap && context.sourceFileMap[url])
                    {
                        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
                            FBTrace.sysout("findContextByURL found match in sourceFileMap");
                        return errorContext = context;
                    }
                }

                if (context.loaded)
                {
                    if (Css.getStyleSheetByHref(url, context))
                    {
                        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
                        {
                            FBTrace.sysout("findContextByURL found match to in loaded " +
                                "styleSheetMap");
                        }

                        return errorContext = context;
                    }
                    else
                    {
                        return false;
                    }
                }
                else  // then new stylesheets are still coming in.
                {
                    if (context.getCompilationUnit(url))
                    {
                        if (FBTrace.DBG_EERRORLOG)
                            FBTrace.sysout("findContextByURL found match in compilationUnits");

                        return errorContext = context;
                    }

                    if (Css.getStyleSheetByHref(url, context))
                    {
                        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
                        {
                            FBTrace.sysout("findContextByURL found match to in non-loaded " +
                                "styleSheetMap");
                        }

                        // but we already have this one.
                        errorContext = context;
                    }

                    // clear the cache for next time.
                    delete context.styleSheetMap;
                }
            });

        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS && "initTime" in this)
        {
            var deltaT = new Date().getTime() - this.initTime.getTime();
            FBTrace.sysout("errors.getErrorContext sheets: " + Css.totalSheets +
                " rules: " + Css.totalRules + " time: " + deltaT);
        }

        if (!errorContext)
        {
            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("errors.getErrorContext no context from error filename:"+
                    url, object);
        }

        // Use nsIScriptError/nsIScriptError2 to compare the parent window
        // guessed by Firebug with the window found through outerWindowID
        if (FBTrace.DBG_ERRORLOG)
        {
            var win1 = getErrorWindow(object);
            var win2 = errorContext ? errorContext.window : null;

            win1 = Win.getRootWindow(win1);
            win2 = Win.getRootWindow(win2);

            var id1 = Win.getWindowProxyIdForWindow(win1);
            var id2 = Win.getWindowProxyIdForWindow(win2);

            if (win1 && id1 != id2 && errorContext)
            {
                var win1Name = Win.safeGetWindowLocation(win1);
                var win2Name = Win.safeGetWindowLocation(win2);
                var moreInfo = {object: object, fromError2: win1, fromFirebug: win2};

                FBTrace.sysout("errors.getErrorContext; ERROR wrong parent window? " +
                    win1Name + " !== " + win2Name, moreInfo);
            }
        }

        // we looked everywhere...
        return errorContext;
    },

    toggleWatchForErrors: function(watchForErrors)
    {
        var previous = this.watchForErrors;
        this.watchForErrors = watchForErrors;
        this.checkEnabled();

        return (previous !== this.watchForErrors);
    },

    checkEnabled: function()
    {
        var beEnabled = this.watchForErrors && this.mustBeEnabled();
        if (beEnabled)
        {
            if (!this.isObserving)
                this.startObserving();
            // else we must be and we are observing
        }
        else
        {
            if (this.isObserving)
                this.stopObserving();
            // else we must not be and we are not
        }

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.checkEnabled mustBeEnabled: " + this.mustBeEnabled() +
                " Console.isAlwaysEnabled " + Console.isAlwaysEnabled() +
                " isObserving:" + this.isObserving);
    },

    mustBeEnabled: function()
    {
        var optionMap =
        {
            showJSErrors:1,
            showJSWarnings:1,
            showCSSErrors:1,
            showXMLErrors: 1,
            showChromeErrors: 1,
            showChromeMessages: 1,
            showXMLHttpRequests: 1,
            showStackTrace: 1
        };

        for (var p in optionMap)
        {
            if (Firebug[p])
                return true;
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    reparseXPC: function(errorMessage, context)
    {
        var reXPCError = /JavaScript Error:\s*\"([^\"]*)\"/;
        var reFile = /file:\s*\"([^\"]*)\"/;
        var reLine = /line:\s*(\d*)/;
        var m = reXPCError.exec(errorMessage);
        if (!m)
            return null;

        var msg = m[1];
        var sourceFile = null;
        m = reFile.exec(errorMessage);
        if (m)
            sourceFile = m[1];

        var sourceLineNo = 0;
        m = reLine.exec(errorMessage);
        if (m)
            sourceLineNo = m[1];

        var sourceLine = null;
        if (sourceFile && sourceLineNo && sourceLineNo != 0)
        {
            if (context.sourceCache)
            {
                sourceLine = context.sourceCache.getLine(sourceFile, sourceLineNo);
            }
            else if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("errors.reparseXPC; ERROR, NULL context.sourceCache, " +
                    sourceFile + ", " + sourceLineNo);
            }
        }

        var error = new FirebugReps.ErrorMessageObj(msg, sourceFile,
            sourceLineNo, sourceLine, "error", context, null);
        return error;
    }
});

// ********************************************************************************************* //
// Local Helpers

const categoryMap =
{
    "javascript": "js",
    "JavaScript": "js",
    "DOM": "js",
    "DOM:HTML": "js",
    "Events": "js",
    "CSS": "css",
    "HTML": "xml",
    "XML": "xml",
    "malformed-xml": "xml"
};

function getBaseCategory(categories)
{
    var categoryList = categories.split(" ");
    for (var i=0; i<categoryList.length; ++i)
    {
        var category = categoryList[i];
        if (categoryMap.hasOwnProperty(category))
            return categoryMap[category];
    }
}

function whyNotShown(url, categoryList, isWarning)
{
    var m = urlRe.exec(url);
    var errorScheme = m ? m[1] : "";
    if (errorScheme == "javascript")
        return null;

    var isChrome = false;

    if (!categoryList)
    {
        return Firebug.showChromeErrors ? null :
            "no category, assume chrome, showChromeErrors false";
    }

    var categories = categoryList.split(" ");
    for (var i=0; i<categories.length; ++i)
    {
        var category = categories[i];
        if (category == "CSS" && !Firebug.showCSSErrors)
        {
            return "showCSSErrors";
        }
        else if ((category == "HTML" || category == "XML" || category == "malformed-xml") &&
            !Firebug.showXMLErrors)
        {
            return "showXMLErrors";
        }
        else if ((category == "javascript" || category == "JavaScript" || category == "DOM")
            && !isWarning && !Firebug.showJSErrors)
        {
            return "showJSErrors";
        }
        else if ((category == "javascript" || category == "JavaScript" || category == "DOM" ||
                category == "DOM:HTML")
            && isWarning && !Firebug.showJSWarnings)
        {
            return "showJSWarnings";
        }
        else if (errorScheme == "chrome" || category == "XUL" || category == "chrome" ||
            category == "XBL" || category == "component")
        {
            isChrome = true;
        }
    }

    if (isChrome && !Firebug.showChromeErrors)
        return "showChromeErrors";

    return null;
}

function lessTalkMoreAction(context, object, isWarning)
{
    if (!context)
    {
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe dropping " + object.category + " no context");
        return false;
    }

    var enabled = Console.isAlwaysEnabled();
    if (!enabled)
        return null;

    var why = whyNotShown(object.sourceName, object.category, isWarning);
    if (why)
    {
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe dropping " + object.category + " because: " + why);

        context.droppedErrors = context.droppedErrors || {};

        if (!context.droppedErrors[object.category])
            context.droppedErrors[object.category] = 1;
        else
            context.droppedErrors[object.category] += 1;

        return null;
    }

    // nsIScriptError
    var incoming_message = object.errorMessage;

    // nsIConsoleMessage
    if (!incoming_message)
        incoming_message = object.message;

    if (Firebug.suppressPointlessErrors)
    {
        for (var msg in pointlessErrors)
        {
            if (msg.charAt(0) == incoming_message.charAt(0))
            {
                if (Str.hasPrefix(incoming_message, msg))
                {
                    if (FBTrace.DBG_ERRORLOG)
                        FBTrace.sysout("errors.observe dropping pointlessError: " + msg);
                    return null;
                }
            }
        }
    }

    var msgId = [incoming_message, object.sourceName, object.lineNumber].join("/");
    return msgId;
}

function checkForException(context, object)
{
    if (object.flags & object.exceptionFlag)
    {
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe is exception");

        if (context.thrownStackTrace)
        {
            Firebug.errorStackTrace = context.thrownStackTrace;

            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("errors.observe trace.frames", context.thrownStackTrace.frames);

            delete context.thrownStackTrace;
        }
        else
        {
             if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("errors.observe NO context.thrownStackTrace");
        }
        return true;
    }

    delete context.thrownStackTrace;
    return false;
}

/**
 * Returns a parent window (outer window) for given error object (an object
 * that is passed into a consoleListener).
 * This method should be the primary way how to find the parent window for any
 * error object.
 *
 * @param {Object} object Error object (implementing nsIScriptError2 or nsIScriptError)
 */
function getErrorWindow(object)
{
    try
    {
        // nsIScriptError2 is merged into nsIScriptError in Firefox 12 (bug
        // 711721), so check for the one that is relevant.
        var why;
        if (object instanceof (Ci["nsIScriptError2"] || Ci["nsIScriptError"]))
        {
            if (object.outerWindowID)
            {
                var win;

                // getOuterWindowWithId moved to nsIWindowMediator in Firefox 23
                // See: https://bugzilla.mozilla.org/show_bug.cgi?id=861495
                if (typeof(wm.getOuterWindowWithId) == "function")
                    win = wm.getOuterWindowWithId(object.outerWindowID);
                else
                    win = domWindowUtils.getOuterWindowWithId(object.outerWindowID);

                if (win)
                    return win;
                else
                    why = "no getOuterWindowWithId";
            }
            else
            {
                why = "no outerWindowID";
            }
        }
        else
        {
            why = "not an nsIScriptError";
        }

        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.getErrorWindow failed " + why, object);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.getErrorWindow; EXCEPTION" + err, err);
    }

    return null;
}

function getExceptionContext(context, object)
{
    var errorWin = getErrorWindow(object);
    if (errorWin)
    {
        var errorContext = Firebug.connection.getContextByWindow(errorWin);
        if (FBTrace.DBG_ERRORLOG)
        {
            FBTrace.sysout("errors.observe exception context: " +
                (errorContext ? errorContext.getName() : "none") + " errorWin: " +
                    Win.safeGetWindowLocation(errorWin));
        }

        if (errorContext)
            return errorContext;
    }

    return context;
}

function correctLineNumbersOnExceptions(object, error)
{
    var m = reException1.exec(object.errorMessage) || reException2.exec(object.errorMessage);
    if (m)
    {
        var exception = m[1];
        if (exception)
            error.message = exception;
        var sourceName = m[3];
        var lineNumber = parseInt(m[4]);

        error.correctSourcePoint(sourceName, lineNumber);

        if (FBTrace.DBG_ERRORLOG)
        {
            FBTrace.sysout("errors.correctLineNumbersOnExceptions corrected message " +
                "with sourceName: "+ sourceName + "@" + lineNumber);
        }
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Errors);

return Firebug.Errors;

// ********************************************************************************************* //
});
