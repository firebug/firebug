/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIScriptError = Ci.nsIScriptError;
const nsIConsoleMessage = Ci.nsIConsoleMessage;

const WARNING_FLAG = nsIScriptError.warningFlag;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const urlRe = new RegExp("([^:]*):(//)?([^/]*)");
const reUncaught = /uncaught exception/;
const reException = /uncaught exception:\s\[Exception...\s\"([^\"]*)\".*nsresult:.*\(([^\)]*)\).*location:\s\"([^\s]*)\sLine:\s(\d*)\"/;
const statusBar = $("fbStatusBar");
const statusText = $("fbStatusText");

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


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const fbs = Cc["@joehewitt.com/firebug;1"].getService().wrappedJSObject;
const consoleService = CCSV("@mozilla.org/consoleservice;1", "nsIConsoleService");

// ************************************************************************************************

var Errors = Firebug.Errors = extend(Firebug.Module,
{
    dispatchName: "errors",

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

        if (context == FirebugContext)
            this.showCount(context.errorCount);
    },

    showMessageOnStatusBar: function(error)
    {
        if (statusText && statusBar && Firebug.breakOnErrors && error.message &&  !(error.flags & WARNING_FLAG))  // sometimes statusText is undefined..how?
        {
            statusText.setAttribute("value", error.message);
            statusBar.setAttribute("errors", "true");
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.showMessageOnStatusBar error.message:"+error.message+"\n");
        }
    },

    showCount: function(errorCount)
    {
        if (!statusBar)
            return;

        if (errorCount)
        {
            if (Firebug.showErrorCount)
            {
                var errorLabel = $STRP("plural.Error_Count", [errorCount]);
                statusText.setAttribute("value", errorLabel);
            }

            statusBar.setAttribute("errors", "true");
        }
        else
        {
            statusText.setAttribute("value", "");
            statusBar.removeAttribute("errors");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Called by Console

    startObserving: function()
    {
        consoleService.registerListener(this);
        this.isObserving = true;
    },

    stopObserving: function()
    {
        consoleService.unregisterListener(this);
        this.isObserving = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
            var isWarning = object && object.flags & WARNING_FLAG;  // This cannot be pulled in front of the instanceof
            var CSSParser = object && object.category == "CSS Parser";
            var XPConnect = object && object.category && object.category.split(' ').indexOf("XPConnect") != -1;
            if (ScriptError && !XPConnect)  // all branches should trace 'object'
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("errors.observe nsIScriptError: "+object.errorMessage, object);

                var context = this.getErrorContext(object);  // after instanceof
                context = this.logScriptError(context, object, isWarning);
                if (!context)
                    return;
            }
            else
            {
                if (Firebug.showChromeMessages)
                {
                    if (ConsoleMessage)
                    {
                        if (FBTrace.DBG_ERRORS)
                            FBTrace.sysout("errors.observe nsIConsoleMessage: "+object.message, object);

                        var context = this.getErrorContext(object);  // after instanceof
                        var msgId = lessTalkMoreAction(context, object, isWarning);
                        if (!msgId)
                            return;
                        if (context)
                            Firebug.Console.log(object.message, context, "consoleMessage", FirebugReps.Text);
                    }
                    else if (object.message)
                    {
                        if (FBTrace.DBG_ERRORS)
                            FBTrace.sysout("errors.observe object.message:", object);

                        var context = this.getErrorContext(object);
                        if (context)  // maybe just FirebugContext
                            Firebug.Console.log(object.message, context, "consoleMessage", FirebugReps.Text);
                        else
                            FBTrace.sysout("errors.observe, no context for message", object);
                    }
                    else
                        FBTrace.sysout("errors.observe, no message in object", object);
                }
                else
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("errors.observe showChromeMessages off, dropped:", object);
                    return;
                }
            }
            if (FBTrace.DBG_ERRORS)
            {
                if (context)
                {
                    if (context.window)
                        FBTrace.sysout((isWarning?"warning":"error")+" logged to "+ context.getName());
                    else
                    {
                        FBTrace.sysout("errors.observe, context with no window, "+(isWarning?"warning":"error")+" object:", object);
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
            if (FBTrace.DBG_ERRORS)
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

        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.observe logScriptError "+(Firebug.errorStackTrace?"have ":"NO ")+"errorStackTrace error object:", {object: object, errorStackTrace: Firebug.errorStackTrace});

        var category = getBaseCategory(object.category);
        var isJSError = category == "js" && !isWarning;

        var error = new ErrorMessage(object.errorMessage, object.sourceName,
                object.lineNumber, object.sourceLine, category, context, null, msgId);  // the sourceLine will cause the source to be loaded.

        if (Firebug.showStackTrace && Firebug.errorStackTrace)
        {
            error.correctWithStackTrace(Firebug.errorStackTrace);
        }
        else if (checkForUncaughtException(context, object))
        {
            context = getExceptionContext(context);
            correctLineNumbersOnExceptions(object, error);
        }

        var msgId = lessTalkMoreAction(context, object, isWarning);
        if (!msgId)
            return null;

        Firebug.errorStackTrace = null;  // clear global: either we copied it or we don't use it.

        if (!isWarning)
            this.increaseCount(context);

        var className = isWarning ? "warningMessage" : "errorMessage";

        if (context)
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.observe delayed log to "+context.getName()+"\n");
             // then report later to avoid loading sourceS
            context.throttle(this.delayedLogging, this, [msgId, context, error, context, className, false, true], true);
        }
        else
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.observe direct log to FirebugContext"+FirebugContext+"\n");
            Firebug.Console.log(error, FirebugContext,  className);
        }
        return context;
    },

    delayedLogging: function()
    {
        var args = cloneArray(arguments);
        var msgId = args.shift();
        var context = args.shift();
        var row = Firebug.Console.log.apply(Firebug.Console, args);
        return row;
    },

    getErrorContext: function(object)
    {
        var url = object.sourceName;
        if(!url)
            return FirebugContext;  // eg some XPCOM messages

        var errorContext = null;
        TabWatcher.iterateContexts(
            function findContextByURL(context)
            {
                if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                    FBTrace.sysout("findContextByURL "+context.getName());

                if (!context.window || !context.getWindowLocation())
                    return false;

                if (context.getWindowLocation().toString() == url)
                {
                    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                        FBTrace.sysout("findContextByURL found match to context window location");
                    return errorContext = context;
                }
                else
                {
                    if (context.sourceFileMap && context.sourceFileMap[url])
                    {
                        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                            FBTrace.sysout("findContextByURL found match in sourceFileMap");
                        return errorContext = context;
                    }
                }

                if (context.loaded)
                {
                    if (FBL.getStyleSheetByHref(url, context))
                    {
                        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                            FBTrace.sysout("findContextByURL found match to in loaded styleSheetMap");
                        return errorContext = context;
                    }
                    else
                        return false;
                }
                else  // then new stylesheets are still coming in.
                {
                    if (FBL.getStyleSheetByHref(url, context))
                    {
                        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                            FBTrace.sysout("findContextByURL found match to in non-loaded styleSheetMap");
                        errorContext = context;  // but we already have this one.
                    }
                    delete context.styleSheetMap; // clear the cache for next time.
                }
            }
        );

        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS && 'initTime' in this)
        {
            var deltaT = new Date().getTime() - this.initTime.getTime();
            FBTrace.sysout("errors.getErrorContext sheets: "+FBL.totalSheets+" rules: "+FBL.totalRules+" time: "+deltaT);
        }

        if (!errorContext)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("errors.getErrorContext no context from error filename:"+url, object);
            errorContext = FirebugContext;  // this is problem if the user isn't viewing the page with errors
        }

        if (FBTrace.DBG_ERRORS && !FirebugContext)
            FBTrace.sysout("errors.observe, no FirebugContext in "+window.location+"\n");

        return errorContext; // we looked everywhere...
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initContext: function(context)
    {
        this.clear(context);

        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        {
            FBL.totalSheets = 0;
            FBL.totalRules = 0;
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
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS && 'initTime' in this)
        {
            var deltaT = new Date().getTime() - this.initTime.getTime();
            FBTrace.sysout("errors.destroyContext sheets: "+FBL.totalSheets+" rules: "+FBL.totalRules+" time: "+deltaT);
        }
    },

    updateOption: function(name, value)
    {
        this.checkEnabled();
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
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.checkEnabled mustBeEnabled: "+this.mustBeEnabled()+" isObserving:"+this.isObserving);
    },

    mustBeEnabled: function()
    {
        const optionMap = {showJSErrors:1, showJSWarnings:1, showCSSErrors:1, showXMLErrors: 1,
                showChromeErrors: 1, showChromeMessages: 1, showExternalErrors: 1, showXMLHttpRequests: 1,
                showStackTrace: 1};

        for (var p in optionMap)
        {
            if (Firebug[p])
                return true;
        }
        return false;
    },
    // ******************************************************************************

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
            sourceLine = context.sourceCache.getLine(sourceFile, sourceLineNo);

        var error = new ErrorMessage(msg, sourceFile,
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
        if (FBTrace.DBG_ERRORS)
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
        if (FBTrace.DBG_ERRORS)
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
                    if (FBTrace.DBG_ERRORS)
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
        if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.observe is exception\n");
        if (reUncaught.test(object.errorMessage))
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("uncaught exception matches "+reUncaught+"\n");
            if (context.thrownStackTrace)
            {
                Firebug.errorStackTrace = context.thrownStackTrace;
                if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.observe trace.frames", context.thrownStackTrace.frames);
                delete context.thrownStackTrace;
            }
            else
            {
                 if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.observe NO context.thrownStackTrace\n");
            }
            return true;
        }
        else
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("errors.observe not an uncaught exception\n");
        }
    }
    delete context.thrownStackTrace;
    return false;
}

function getExceptionContext(context)
{
    var errorWin = fbs.lastErrorWindow;  // not available unless Script panel is enabled.
    if (errorWin)
    {
        var errorContext = TabWatcher.getContextByWindow(errorWin);
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.observe exception context:"+(errorContext?errorContext.getName():"none")+" errorWin: "+errorWin+"\n");
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

        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("errors.correctLineNumbersOnExceptions corrected message with sourceName: "+sourceName+"@"+lineNumber);
    }
}

// ************************************************************************************************

Firebug.registerModule(Errors);

// ************************************************************************************************

}});
