/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const nsIScriptError = CI("nsIScriptError");

const WARNING_FLAG = nsIScriptError.warningFlag;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const urlRe = new RegExp("([^:]*):(//)?([^/]*)");

const statusBar = $("fbStatusBar");
const statusText = $("fbStatusText");

const pointlessErrors =
{
    "uncaught exception: Permission denied to call method Location.toString": 1,
    "uncaught exception: Permission denied to get property Window.writeDebug": 1,
    "uncaught exception: Permission denied to get property XULElement.accessKey": 1,
    "this.docShell has no properties": 1,
    "aDocShell.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI has no properties": 1
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const fbs = CCSV("@joehewitt.com/firebug;1", "nsIFireBug");
const consoleService = CCSV("@mozilla.org/consoleservice;1", "nsIConsoleService");

// ************************************************************************************************

var Errors = Firebug.Errors = extend(Firebug.Module,
{
    clear: function(context)
    {
        this.setCount(context, 0)
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

    showMessageOnStatusBar: function(errorLabel)
    {
        if (statusBar)
            statusBar.setAttribute("errors", "true");
        if (statusText)  // sometimes this is undefined..how?
            statusText.setAttribute("value", errorLabel);
    },

    showCount: function(errorCount)
    {
        if (!statusBar)
            return;

        if (errorCount)
        {
            if (Firebug.showErrorCount)
            {
                var errorLabel = errorCount > 1
                    ? $STRF("ErrorsCount", [errorCount])
                    : $STRF("ErrorCount", [errorCount]);

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
    // extends ConsoleObserver

    observe: function(object)
    {
        if(typeof(FBTrace) == "undefined") return;
        try
        {
            if (FBTrace.DBG_ERRORS)                                                                                    /*@explore*/
                FBTrace.dumpProperties("errors.observe "+(Firebug.errorStackTrace?"have ":"NO ")+"errorStackTrace error object:", object);/*@explore*/
            if (object instanceof nsIScriptError)
            {
                var context = FirebugContext;

                var category = getBaseCategory(object.category);
                var isWarning = object.flags & WARNING_FLAG;
                var isJSError = category == "js" && !isWarning;

                if (isJSError)
                {
                    var isSyntaxError = object.sourceLine != null;
                    if (!isSyntaxError)
                    {
                        var errorWin = fbs.lastErrorWindow;
                        if (errorWin)
                        {
                            context = TabWatcher.getContextByWindow(errorWin);
                            if (FBTrace.DBG_ERRORS)                                                                    /*@explore*/
                                FBTrace.sysout("errors.observe context:"+context+" errorWin"+errorWin+"\n");           /*@explore*/
                            if (!context)
                                return;
                        }
                    }
                }

                if (!context || !categoryFilter(object.sourceName, object.category, isWarning))
                    return;

                if (object.errorMessage in pointlessErrors)
                    return;

                var msgId = [object.errorMessage, object.sourceName, object.lineNumber].join("/");
                if (context.errorMap && msgId in context.errorMap)
                {
                    context.errorMap[msgId] += 1;
                    return;
                }

                if (!context.errorMap)
                    context.errorMap = {};

                context.errorMap[msgId] = 1;

                if (!isWarning)
                    this.increaseCount(context);

                var sourceName = object.sourceName;
                var lineNumber = object.lineNumber;


                if (Firebug.showStackTrace && isJSError)
                {
                    var trace = Firebug.errorStackTrace;
                    if (trace)
                    {
                        var stack_frame = trace.frames[0];
                        if (stack_frame)
                        {
                            sourceName = stack_frame.href;
                            lineNumber = stack_frame.lineNo;
                        }
                        var correctedError = object.init(object.errorMessage, sourceName, object.sourceLine,lineNumber, object.columnNumber, object.flags, object.category);
                        if (FBTrace.DBG_ERRORS)                                                                            /*@explore*/
                            FBTrace.dumpProperties("errors.observe trace frames:", trace.frames);                          /*@explore*/
                    }
                    else
                    {
                        // There was no trace, but one was requested. Therefore fbs never called
                        // debuggr.onError() because the error was for a different window.
                        if (Firebug.showStackTrace && isJSError)
                            return;
                    }
                }
                Firebug.errorStackTrace = null;  // clear global: either we copied it or we don't use it.

                var error = new ErrorMessage(object.errorMessage, sourceName,
                        lineNumber, object.sourceLine, category, context, trace);

                var className = isWarning ? "warningMessage" : "errorMessage";
                Firebug.Console.log(error, context,  className);
            }
            else if (Firebug.showChromeMessages)
            {
                if (FBTrace.DBG_ERRORS)                                                                               /*@explore*/
                    FBTrace.dumpProperties("errors.observe showChromeMessages message:", object.message);             /*@explore*/
                // Must be an nsIConsoleMessage
                Firebug.Console.log(object.message, context, "consoleMessage", FirebugReps.Text);
            }
            else
            {
                if (FBTrace.DBG_ERRORS)                                                                                /*@explore*/
                    FBTrace.dumpProperties("errors.observe dropped:", object.message);                                 /*@explore*/
            }
        }
        catch (exc)
        {
            // Errors prior to console init will come out here, eg error message from Firefox startup jjb.
            // ERROR("Error while reporting error: " + exc);
            if (FBTrace.DBG_ERRORS)                                                                                    /*@explore*/
                FBTrace.dumpProperties("errors.observe FAILS", exc);                                                   /*@explore*/
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    enable: function()
    {
        consoleService.registerListener(this);

        if (statusBar)
            statusBar.setAttribute("disabled", "true");
    },

    disable: function()
    {
        consoleService.unregisterListener(this);
    },

    initContext: function(context)
    {
        context.errorCount = 0;
    },

    showContext: function(browser, context)
    {
        if (statusBar)
            statusBar.setAttribute("disabled", !context);

        this.showCount(context ? context.errorCount : 0);
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
        if (category in categoryMap)
            return categoryMap[category];
    }
}

function categoryFilter(url, category, isWarning)
{
    var m = urlRe.exec(url);
    var errorScheme = m ? m[1] : "";
    if (errorScheme == "javascript")
        return true;

    var isChrome = false;

    var categories = category.split(" ");
    for (var i = 0 ; i < categories.length; ++i)
    {
        var category = categories[i];
        if (category == "CSS" && !Firebug.showCSSErrors)
            return false;
        else if ((category == "XML" || category == "malformed-xml" ) && !Firebug.showXMLErrors)
            return false;
        else if ((category == "javascript" || category == "JavaScript" || category == "DOM")
                    && !isWarning && !Firebug.showJSErrors)
            return false;
        else if ((category == "javascript" || category == "JavaScript" || category == "DOM")
                    && isWarning && !Firebug.showJSWarnings)
            return false;
        else if (errorScheme == "chrome" || category == "XUL" || category == "chrome"
                || category == "component")
            isChrome = true;
    }

    if ((isChrome && !Firebug.showChromeErrors) || (!isChrome && !Firebug.showWebErrors))
        return false;

    return true;
}

function domainFilter(url)
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

// ************************************************************************************************

Firebug.registerModule(Errors);

// ************************************************************************************************

}});
