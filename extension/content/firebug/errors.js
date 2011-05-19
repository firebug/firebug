/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/reps",
    "firebug/lib/xpcom",
    "firebug/lib/css",
    "firebug/firefox/window",
    "firebug/lib/array",
],
function(Extend, Firebug, FirebugReps, Xpcom, Css, Win, Arr) {

// **********************************************************************************************//
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIScriptError = Ci.nsIScriptError;
const nsIConsoleMessage = Ci.nsIConsoleMessage;

const WARNING_FLAG = nsIScriptError.warningFlag;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const urlRe = new RegExp("([^:]*):(//)?([^/]*)");
const reUncaught = /uncaught exception/;
const reException = /uncaught exception:\s\[Exception...\s\"([^\"]*)\".*nsresult:.*\(([^\)]*)\).*location:\s\"([^\s]*)\sLine:\s(\d*)\"/;

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

// ********************************************************************************************* //

var Errors = Firebug.Errors = Extend.extend(Firebug.Module,
{
    dispatchName: "errors",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    shutdown: function()
    {
        // Make sure the error obsever is removed.
        this.stopObserving();

        Firebug.Module.shutdown.apply(this, arguments);
    },

    initContext: function(context)
    {
        this.clear(context);

        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
        {
            Css.totalSheets = 0;
            Css.totalRules = 0;
            this.initTime = new Date();
        }
    },

    showContext: function(browser, context)
    {
        this.showCount(context ? context.errorCount : 0);
    },

    unwatchWindow: function(context, win)  // called for top window and frames.
    {
        this.clear(context);  // If we ever get errors by window from Firefox we can cache by window.
    },

    destroyContext: function(context, persistedState)
    {
        this.showCount(0);
        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS && 'initTime' in this)
        {
            var deltaT = new Date().getTime() - this.initTime.getTime();
            FBTrace.sysout("errors.destroyContext sheets: "+Css.totalSheets+" rules: "+
                Css.totalRules+" time: "+deltaT);
        }
    },

    updateOption: function(name, value)
    {
        this.checkEnabled();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    clear: function(context)
    {
        this.setCount(context, 0); // reset the UI counter
        delete context.droppedErrors;    // clear the counts of dropped errors
    },

    increaseCount: function(context)
    {
        this.setCount(context, context.errorCount + 1)
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
        if (consoleService)
            consoleService.registerListener(this);
        this.isObserving = true;
    },

    stopObserving: function()
    {
        if (consoleService)
            consoleService.unregisterListener(this);
        this.isObserving = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends consoleListener

    observe: function(object)
    {
        try
        {
            if (window.closed)
                this.stopObserving();
            if (typeof FBTrace == 'undefined')
                return;
            if (!FBTrace)
                return;
        }
        catch(exc)
        {
            return;
        }

        try
        {
            var ScriptError = object instanceof nsIScriptError;
            var ConsoleMessage = object instanceof nsIConsoleMessage;

            // This cannot be pulled in front of the instanceof
            var isWarning = object && object.flags & WARNING_FLAG;
            var CSSParser = object && object.category == "CSS Parser";
            var XPConnect = object && object.category && object.category.split(' ').indexOf("XPConnect") != -1;
            if (ScriptError && !XPConnect)  // all branches should trace 'object'
            {
                if (FBTrace.DBG_ERRORLOG)
                    FBTrace.sysout("errors.observe nsIScriptError: "+object.errorMessage, object);

                var context = this.getErrorContext(object);  // after instanceof

                if (context)
                    return this.logScriptError(context, object, isWarning);

                if (FBTrace.DBG_ERRORS || FBTrace.DBG_ERRORLOG)
                    FBTrace.sysout("errors.observe nsIScriptError no context! "+object.errorMessage, object);
            }
            else
            {
                if (Firebug.showChromeMessages)
                {
                    if (ConsoleMessage)
                    {
                        if (FBTrace.DBG_ERRORLOG)
                            FBTrace.sysout("errors.observe nsIConsoleMessage: "+object.message, object);

                        var context = this.getErrorContext(object);  // after instanceof
                        if (!context)
                            context = Firebug.currentContext;
                        var msgId = lessTalkMoreAction(context, object, isWarning);
                        if (!msgId)
                            return;
                        if (context)
                            Firebug.Console.log(object.message, context, "consoleMessage", FirebugReps.Text);
                    }
                    else if (object.message)
                    {
                        if (FBTrace.DBG_ERRORLOG)
                            FBTrace.sysout("errors.observe object.message:", object);

                        var context = this.getErrorContext(object);

                        if (!context)
                            context = Firebug.currentContext;

                        if (context)
                            Firebug.Console.log(object.message, context, "consoleMessage", FirebugReps.Text);
                        else
                            FBTrace.sysout("errors.observe, no context for message", object);
                    }
                    else
                        FBTrace.sysout("errors.observe, no message in object", object);
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
                        FBTrace.sysout((isWarning?"warning":"error")+" logged to "+ context.getName());
                    else
                    {
                        FBTrace.sysout("errors.observe, context with no window, "+
                            (isWarning?"warning":"error")+" object:", object);
                        FBTrace.sysout("errors.observe, context with no window, context:", context);
                    }
                }
                else
                    FBTrace.sysout("errors.observe, no context!\n");
            }
        }
        catch (exc)
        {
            // Errors prior to console init will come out here, eg error message from Firefox startup jjb.
            if (FBTrace.DBG_ERRORLOG)
            {
                FBTrace.sysout("errors.observe FAILS "+exc, exc);
                FBTrace.sysout("errors.observe object "+object, object);
            }
        }
    },

    logScriptError: function(context, object, isWarning)
    {
        if (!context)
            return;

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe logScriptError "+(Firebug.errorStackTrace?"have ":"NO ")+
                "errorStackTrace error object:", {object: object, errorStackTrace: Firebug.errorStackTrace});

        var category = getBaseCategory(object.category);
        var isJSError = category == "js" && !isWarning;

        // the sourceLine will cause the source to be loaded.
        var error = new FirebugReps.ErrorMessageObj(object.errorMessage, object.sourceName,
            object.lineNumber, object.sourceLine, category, context, null, msgId);

        if (Firebug.showStackTrace && Firebug.errorStackTrace)
        {
            error.correctWithStackTrace(Firebug.errorStackTrace);
        }
        else if (checkForUncaughtException(context, object))
        {
            context = getExceptionContext(context, object);
            correctLineNumbersOnExceptions(object, error);
        }

        var msgId = lessTalkMoreAction(context, object, isWarning);
        if (!msgId)
            return null;

        Firebug.errorStackTrace = null;  // clear global: either we copied it or we don't use it.

        if (!isWarning)
            this.increaseCount(context);

        var className = isWarning ? "warningMessage" : "errorMessage";

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe delayed log to "+context.getName()+"\n");

        // report later to avoid loading sourceS
        context.throttle(this.delayedLogging, this, [msgId, context, error, context, className,
            false, true], true);
    },

    delayedLogging: function()
    {
        var args = Arr.cloneArray(arguments);
        var msgId = args.shift();
        var context = args.shift();
        var row = Firebug.Console.log.apply(Firebug.Console, args);
        return row;
    },

    getErrorContext: function(object)
    {
        var url = object.sourceName;
        if(!url)
            return Firebug.currentContext;  // eg some XPCOM messages
        if (url.indexOf("://chromebug/"))
            return Firebug.currentContext; // no context for self

        var errorContext = null;
        Firebug.TabWatcher.iterateContexts(
            function findContextByURL(context)
            {
                if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS)
                    FBTrace.sysout("findContextByURL "+context.getName());

                if (!context.window || !context.getWindowLocation())
                    return false;

                if (FBTrace.DBG_ERRORLOG)
                    FBTrace.sysout("findContextByURL seeking "+url+" in "+
                        (context.loaded?'loaded':'not loaded')+
                        " window location: "+context.getWindowLocation().toString());

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
                            FBTrace.sysout("findContextByURL found match to in loaded styleSheetMap");
                        return errorContext = context;
                    }
                    else
                        return false;
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
                            FBTrace.sysout("findContextByURL found match to in non-loaded styleSheetMap");
                        errorContext = context;  // but we already have this one.
                    }
                    delete context.styleSheetMap; // clear the cache for next time.
                }
            });

        if (FBTrace.DBG_ERRORLOG && FBTrace.DBG_CSS && 'initTime' in this)
        {
            var deltaT = new Date().getTime() - this.initTime.getTime();
            FBTrace.sysout("errors.getErrorContext sheets: "+Css.totalSheets+
                " rules: "+Css.totalRules+" time: "+deltaT);
        }

        if (!errorContext)
        {
            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("errors.getErrorContext no context from error filename:"+url, object);
        }

        // Use nsIScriptError2 (if available) to compare the parent window guessed by Firebug
        // with the window produced by the new nsIScriptError2.outerWindowID
        if (FBTrace.DBG_ERRORS)
        {
            var win1 = this.getErrorWindow(object);
            var win2 = errorContext ? errorContext.window : null;

            win1 = Win.getRootWindow(win1);
            win2 = Win.getRootWindow(win2);
            if (win1 && win1 != win2)
            {
                var win1Name = Win.safeGetWindowLocation(win1);
                var win2Name = Win.safeGetWindowLocation(win2);
                var moreInfo =  {object: object, fromError2: win1, fromFirebug: win2};
                FBTrace.sysout("errors.getErrorContext; ERROR wrong parent window? "+
                    win1Name+" !== "+win2Name, moreInfo);
            }
        }

        return errorContext; // we looked everywhere...
    },

    checkEnabled: function()
    {
        if (this.mustBeEnabled())
        {
            if(!this.isObserving)
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
            FBTrace.sysout("errors.checkEnabled mustBeEnabled: "+this.mustBeEnabled()+
                " isObserving:"+this.isObserving);
    },

    mustBeEnabled: function()
    {
        var optionMap =
        {
            showJSErrors:1, showJSWarnings:1, showCSSErrors:1, showXMLErrors: 1,
            showChromeErrors: 1, showChromeMessages: 1, showExternalErrors: 1,
            showXMLHttpRequests: 1, showStackTrace: 1
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

// ************************************************************************************************
// Local Helpers

const categoryMap =
{
    "javascript": "js",
    "JavaScript": "js",
    "DOM": "js",
    "Events": "js",
    "CSS": "css",
    "XML": "xml",
    "malformed-xml": "xml"
};

function getBaseCategory(categories)
{
    var categoryList = categories.split(" ");
    for (var i = 0 ; i < categoryList.length; ++i)
    {
        var category = categoryList[i];
        if ( categoryMap.hasOwnProperty(category) )
            return categoryMap[category];
    }
}

function whyNotShown(url, category, isWarning)
{
    var m = urlRe.exec(url);
    var errorScheme = m ? m[1] : "";
    if (errorScheme == "javascript")
        return null;

    var isChrome = false;

    if (!category)
        return Firebug.showChromeErrors ? null :"no category, assume chrome, showChromeErrors false";

    var categories = category.split(" ");
    for (var i = 0 ; i < categories.length; ++i)
    {
        var category = categories[i];
        if (category == "CSS" && !Firebug.showCSSErrors)
            return "showCSSErrors";
        else if ((category == "XML" || category == "malformed-xml" ) && !Firebug.showXMLErrors)
            return "showXMLErors";
        else if ((category == "javascript" || category == "JavaScript" || category == "DOM")
                    && !isWarning && !Firebug.showJSErrors)
            return "showJSErrors";
        else if ((category == "javascript" || category == "JavaScript" || category == "DOM")
                    && isWarning && !Firebug.showJSWarnings)
            return "showJSWarnings";
        else if (errorScheme == "chrome" || category == "XUL" || category == "chrome" || category == "XBL"
                || category == "component")
            isChrome = true;
    }

    if ((isChrome && !Firebug.showChromeErrors))
        return "showChromeErrors";

    return null;
}

function domainFilter(url)  // never called?
{
    if (Firebug.showExternalErrors)
        return true;

    var browserWin = document.getElementById("content").contentWindow;

    var m = urlRe.exec(browserWin.location.href);
    if (!m)
        return false;

    var browserDomain = m[3];

    m = urlRe.exec(url);
    if (!m)
        return false;

    var errorScheme = m[1];
    var errorDomain = m[3];

    return errorScheme == "javascript"
        || errorScheme == "chrome"
        || errorDomain == browserDomain;
}

function lessTalkMoreAction(context, object, isWarning)
{
    if (!context)
    {
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe dropping "+object.category+" no context");
        return false;
    }

    var enabled = Firebug.Console.isAlwaysEnabled();
    if (!enabled) {
        return null;
    }

    var why = whyNotShown(object.sourceName, object.category, isWarning);

    if (why)
    {
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe dropping "+object.category+" because: "+why);

        context.droppedErrors = context.droppedErrors || {};
        if (!context.droppedErrors[object.category])
            context.droppedErrors[object.category] = 1;
        else
            context.droppedErrors[object.category] += 1;

        return null;
    }

    var incoming_message = object.errorMessage;  // nsIScriptError
    if (!incoming_message)                       // nsIConsoleMessage
        incoming_message = object.message;

    if (Firebug.suppressPointlessErrors)
    {
        for (var msg in pointlessErrors)
        {

            if( msg.charAt(0) == incoming_message.charAt(0) )
            {
                if (incoming_message.indexOf(msg) == 0)
                {
                    if (FBTrace.DBG_ERRORLOG)
                        FBTrace.sysout("errors.observe dropping pointlessError: "+msg+"\n");
                    return null;
                }
            }
        }
    }

    var msgId = [incoming_message, object.sourceName, object.lineNumber].join("/");

    return msgId;
}

function checkForUncaughtException(context, object)
{
    if (object.flags & object.exceptionFlag)
    {
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe is exception\n");

        if (reUncaught.test(object.errorMessage))
        {
            if (FBTrace.DBG_ERRORLOG) FBTrace.sysout("uncaught exception matches "+reUncaught+"\n");
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
                    FBTrace.sysout("errors.observe NO context.thrownStackTrace\n");
            }
            return true;
        }
        else
        {
            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("errors.observe not an uncaught exception\n");
        }
    }

    delete context.thrownStackTrace;
    return false;
}

/**
 * Returns a parent window (outer window) for given error object (an object
 * that is passed int a consoleListener).
 * This method should be the primary way how to find the parent window for any
 * error object.
 *
 * @param {Object} object Error object (implementing nsIScriptError2 since Fx40)
 */
function getErrorWindow(object)
{
    try
    {
        // Bug 605492 introduces new API: nsIScriptError2.outerWindowID so use it
        // if it's available.
        if (!Ci["nsIScriptError2"])
            return null;

        if (!(object instanceof Ci.nsIScriptError2))
            return null;

        if (!object.outerWindowID)
            return null;

        return domWindowUtils.getOuterWindowWithId(object.outerWindowID);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.getErrorWindowl; EXCEPTION" + err, err);
    }
}


function getExceptionContext(context, object)
{
    var errorWin = getErrorWindow(object)
    if (errorWin)
    {
        var errorContext = Firebug.TabWatcher.getContextByWindow(errorWin);
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.observe exception context:"+
                (errorContext?errorContext.getName():"none")+" errorWin: "+errorWin+"\n");

        if (errorContext)
            return errorContext;
    }
    return context;
}

function correctLineNumbersOnExceptions(object, error)
{
    var m = reException.exec(object.errorMessage);
    if (m)
    {
        var exception = m[1];
        if (exception)
            errorMessage = "uncaught exception: "+exception;
        var nsresult = m[2];
        if (nsresult)
            errorMessage += " ("+nsresult+")";
        var sourceName = m[3];
        var lineNumber = parseInt(m[4]);

        error.correctSourcePoint(sourceName, lineNumber);

        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("errors.correctLineNumbersOnExceptions corrected message with sourceName: "+
                sourceName+"@"+lineNumber);
    }
}

// ************************************************************************************************
// Registration

Firebug.registerModule(Errors);

return Firebug.Errors;

// ************************************************************************************************
});
