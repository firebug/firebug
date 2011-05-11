/* See license.txt for terms of usage */

define([
    "firebug/http/httpLib"
],
function(HTTP) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

var WIN = {};

// ************************************************************************************************
// Window iteration

WIN.iterateWindows = function(win, handler)
{
    if (!win || !win.document)
        return;

    handler(win);

    if (win == top || !win.frames)
        return; // XXXjjb hack for chromeBug

    for (var i = 0; i < win.frames.length; ++i)
    {
        var subWin = win.frames[i];
        if (subWin != win)
            WIN.iterateWindows(subWin, handler);
    }
};

WIN.getRootWindow = function(win)
{
    for (; win; win = win.parent)
    {
        if (!win.parent || win == win.parent || !(win.parent instanceof window.Window) )
            return win;
    }
    return null;
};

// ************************************************************************************************
// Firefox browsing

WIN.openNewTab = function(url, postText)
{
    if (!url)
        return;

    var postData = null;
    if (postText)
    {
        var stringStream = HTTP.getInputStreamFromString(postText);
        postData = Cc["@mozilla.org/network/mime-input-stream;1"].createInstance(Ci.nsIMIMEInputStream);
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
        postData.addContentLength = true;
        postData.setData(stringStream);
    }

    return gBrowser.selectedTab = gBrowser.addTab(url, null, null, postData);
};

WIN.openWindow = function(windowType, url, features, params)
{
    var win = windowType ? wm.getMostRecentWindow(windowType) : null;
    if (win)
    {
        if ("initWithParams" in win)
            win.initWithParams(params);
        win.focus();
    }
    else
    {
        var winFeatures = "resizable,dialog=no,centerscreen" + (features != "" ? ("," + features) : "");
        var parentWindow = (this.instantApply || !window.opener || window.opener.closed) ? window : window.opener;
        win = parentWindow.openDialog(url, "_blank", winFeatures, params);
    }
    return win;
};

WIN.viewSource = function(url, lineNo)
{
    window.openDialog("chrome://global/content/viewSource.xul", "_blank",
        "all,dialog=no", url, null, null, lineNo);
};

// Iterate over all opened firefox windows of the given type. If the callback returns true
// the iteration is stopped.
WIN.iterateBrowserWindows = function(windowType, callback)
{
    var windowList = wm.getZOrderDOMWindowEnumerator(windowType, true);
    if (!windowList.hasMoreElements())
        windowList = wm.getEnumerator(windowType);

    while (windowList.hasMoreElements())
    {
        if (callback(windowList.getNext()))
            return true;
    }

    return false;
};

WIN.iterateBrowserTabs = function(browserWindow, callback)
{
    var tabBrowser = browserWindow.getBrowser();
    var numTabs = tabBrowser.browsers.length;

    for(var index=0; index<numTabs; index++)
    {
        var currentBrowser = tabBrowser.getBrowserAtIndex(index);
        if (callback(tabBrowser.mTabs[index], currentBrowser))
            return true;
    }

    return false;
}

/**
 * Returns <browser> element for specified content window.
 * @param {Object} win - Content window
 */
WIN.getBrowserForWindow = function(win)
{
    var tabBrowser = document.getElementById("content");
    if (tabBrowser && win.document)
        return tabBrowser.getBrowserForDocument(win.document);
};

// ************************************************************************************************

WIN.getWindowId = function(win)
{
    var util = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
    var innerWindowID = "(none)";

    try
    {
        var outerWindowID = util.outerWindowID;
        innerWindowID = util.currentInnerWindowID;
    }
    catch(exc)
    {
        // no - op
    }

    return {
        outer: outerWindowID,
        inner: innerWindowID,
        toString: function() {
            return this.outer+"."+this.inner;
        }
    };
};

WIN.safeGetWindowLocation = function(window)
{
    try
    {
        if (window)
        {
            if (window.closed)
                return "(window.closed)";
            if ("location" in window)
                return window.location+"";
            else
                return "(no window.location)";
        }
        else
            return "(no context.window)";
    }
    catch (exc)
    {
        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("TabContext.getWindowLocation failed "+exc, exc);
            FBTrace.sysout("TabContext.getWindowLocation failed window:", window);
        }

        return "(getWindowLocation: "+exc+")";
    }
};

// ********************************************************************************************* //

return WIN;

// ********************************************************************************************* //
});
