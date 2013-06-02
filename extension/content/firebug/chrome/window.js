/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/http",
    "firebug/chrome/firefox"
],
function(FBTrace, Http, Firefox) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

var Win = {};

var window = {};     // these declarations exist to cause errors if we accidently
var document = {};   // reference these globals

// ********************************************************************************************* //
// Crossbrowser API

Win.getWindowProxyIdForWindow = function(win)
{
    if (!win)
        return null;

    var id = Win.getWindowId(win).outerWindowID;

    // xxxJJB, xxxHonza: the id is often null, what could be the problem?
    // jjb: My guess: just another Mozilla bug
    if (!id)
        return Win.getTabIdForWindow(win);

    return id;
};

Win.getTabForWindow = function(aWindow)
{
    aWindow = Win.getRootWindow(aWindow);

    var tabBrowser = Firefox.getTabBrowser();
    if (!aWindow || !tabBrowser || !tabBrowser.getBrowserIndexForDocument)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("getTabForWindow FAIL aWindow: "+aWindow+" tabBrowser: "+tabBrowser, tabBrowser);
        return null;
    }

    try
    {
        var targetDoc = aWindow.document;

        var tab = null;
        var targetBrowserIndex = tabBrowser.getBrowserIndexForDocument(targetDoc);
        if (targetBrowserIndex != -1)
        {
            tab = tabBrowser.tabContainer.childNodes[targetBrowserIndex];
            return tab;
        }
    }
    catch (ex)
    {
    }

    return null;
};

Win.getTabIdForWindow = function(win)
{
    var tab = Win.getTabForWindow(win);
    return tab ? tab.linkedPanel : null;
};

// ********************************************************************************************* //
// Window iteration

Win.iterateWindows = function(win, handler)
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
            Win.iterateWindows(subWin, handler);
    }
};

Win.getRootWindow = function(win)
{
    for (; win; win = win.parent)
    {
        if (!win.parent || win == win.parent)
            return win;

        // When checking the 'win.parent' type we need to use the target
        // type from the same scope. i.e. from win.parent
        // Iframes from different domains can use different Window type than
        // the top level window.
        if (!(win.parent instanceof win.parent.Window))
            return win;
    }

    return null;
};

// ********************************************************************************************* //
// Firefox browsing

Win.openNewTab = function(url, postText)
{
    if (!url)
        return;

    var postData = null;
    if (postText)
    {
        var stringStream = Http.getInputStreamFromString(postText);
        postData = Cc["@mozilla.org/network/mime-input-stream;1"].createInstance(Ci.nsIMIMEInputStream);
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
        postData.addContentLength = true;
        postData.setData(stringStream);
    }

    var tabBrowser = Firefox.getTabBrowser();
    if (!tabBrowser)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("window.openNewTab; ERROR No tabBrowser!");
        return;
    }

    return tabBrowser.selectedTab = tabBrowser.addTab(url, null, null, postData);
};

// Iterate over all opened firefox windows of the given type. If the callback returns true
// the iteration is stopped.
Win.iterateBrowserWindows = function(windowType, callback)
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

Win.iterateBrowserTabs = function(browserWindow, callback)
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
};


Win.getBrowserByWindow = function(win)
{
    var browsers = Firefox.getBrowsers();
    for (var i = 0; i < browsers.length; ++i)
    {
        var browser = browsers[i];
        if (browser.contentWindow === win)
            return browser;
    }

    return null;
};

// ********************************************************************************************* //

Win.getWindowId = function(win)
{
    var util = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
    var outerWindowID = null;
    var innerWindowID = "(none)";

    try
    {
        outerWindowID = util.outerWindowID;
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

Win.safeGetWindowLocation = function(window)
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

return Win;

// ********************************************************************************************* //
});
