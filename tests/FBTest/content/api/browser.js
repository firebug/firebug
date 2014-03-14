/* See license.txt for terms of usage */

/**
 * This file defines Events APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Browser API

this.getBrowser = function()
{
    return FW.Firebug.Firefox.getTabBrowser();
};

this.getCurrentTabBrowser = function()
{
    var tabbrowser = FBTestFirebug.getBrowser();
    return tabbrowser.selectedBrowser;
};

/**
 * Opens specific URL in a new tab and calls the callback as soon as the tab is ready.
 * @param {String} url URL to be opened in the new tab.
 * @param {Function} callback Callback handler that is called as soon as the page is loaded.
 */
this.openNewTab = function(url, callback)
{
    var tabbrowser = FBTestFirebug.getBrowser();

    // Open new tab and mark as 'test' so it can be closed automatically.
    var newTab = tabbrowser.addTab(url);
    newTab.setAttribute("firebug", "test");
    tabbrowser.selectedTab = newTab;

    // Wait till the new window is loaded.
    var browser = tabbrowser.getBrowserForTab(newTab);
    waitForWindowLoad(browser, callback);

    return newTab;
};

/**
 * Opens specific URL in the current tab and calls the callback as soon as the tab is ready.
 * @param {String} url URL to be opened.
 * @param {Function} callback Callback handler that is called as soon as the page is loaded.
 */
this.openURL = function(url, callback)
{
    var tabbrowser = FBTestFirebug.getBrowser();
    var currTab = tabbrowser.selectedTab;

    // Get the current tab and wait till the new URL is loaded.
    var browser = tabbrowser.getBrowserForTab(currTab);
    waitForWindowLoad(browser, callback);

    // Reload content of the selected tab.
    tabbrowser.selectedBrowser.contentDocument.defaultView.location.href = url;

    return currTab;
};

/**
 * Refresh the current tab.
 * @param {Function} callback Callback handler that is called as soon as the page is reloaded.
 */
this.reload = function(callback)
{
    var tabbrowser = FBTestFirebug.getBrowser();
    var currTab = tabbrowser.selectedTab;

    // Get the current tab and wait till it's reloaded.
    var browser = tabbrowser.getBrowserForTab(currTab);
    waitForWindowLoad(browser, callback);

    // Reload content of the selected tab.
    tabbrowser.selectedBrowser.contentDocument.defaultView.location.reload();

    return currTab;
};

/**
 * Helper method for wait till a window is *really* loaded.
 * @param {Object} browser Window's parent browser.
 * @param {Window} callback Executed when the window is loaded. The window is passed in
 *      as the parameter.
 */
function waitForWindowLoad(browser, callback)
{
    // If the callback isn't specified don't watch the window load at all.
    if (!callback)
        return;

    var loaded = false;
    var painted = false;

    // All expected events have been fired, execute the callback.
    function executeCallback()
    {
        try
        {
            var win = browser.contentWindow;

            FBTest.sysout("waitForWindowLoad; window loaded " + win.location.href);

            // This is a workaround for missing wrappedJSObject property,
            // if the test case comes from HTTP (and not from chrome)
            // xxxHonza: this is rather a hack, it should be removed if possible.
            //if (!win.wrappedJSObject)
            //    win.wrappedJSObject = win;

            //xxxHonza: I have seen win == null once. It looks like the callback
            // is executed for a window, which is already unloaded. Could this happen
            // in case where the test is finished before the listeners are actually
            // executed?
            // xxxHonza: remove 'load' and 'MozAfterPaint' listeners when the test
            // finishes before the window is actually loaded.
            // Use refreshHaltedDebugger test as an example. (breaks during the page load
            // and immediately calls testDone)
            if (!win)
                FBTrace.sysout("waitForWindowLoad: ERROR no window!");

            // The window is loaded, execute the callback now.
            if (win)
                callback(win);
        }
        catch (exc)
        {
            FBTest.exception("waitForWindowLoad", exc);
            FBTest.sysout("runTest FAILS " + exc, exc);
        }
    }

    // Wait for all event that must be fired before the window is loaded.
    // Any event is missing?
    // xxxHonza: In case of Firefox 3.7 the new 'content-document-global-created'
    // (bug549539) could be utilized.
    function waitForEvents(event)
    {
        FBTest.sysout("waitForWindowLoad; event: " + event.type + " (" +
            event.target.location.href + ")");

        if (event.type == "load" && event.target === browser.contentDocument)
        {
            browser.removeEventListener("load", waitForEvents, true);
            loaded = true;
        }
        else if (event.type == "MozAfterPaint" && event.target === browser.contentWindow)
        {
            browser.removeEventListener("MozAfterPaint", waitForEvents, true);
            painted = true;
        }

        // Execute callback after 100ms timeout (the inspector tests need it for now),
        // but this should be set to 0.
        if (loaded && painted)
            setTimeout(executeCallback, 100);
    }

    FBTest.sysout("waitForWindowLoad: adding event listener");

    browser.addEventListener("load", waitForEvents, true);
    browser.addEventListener("MozAfterPaint", waitForEvents, true);

    FBTest.sysout("waitForWindowLoad; waiting...");
};

/**
 * Closes all Firefox tabs that were opened because of test purposes.
 */
this.cleanUpTestTabs = function()
{
    //FBTest.progress("clean up tabs");

    FBTestFirebug.cleanUpListeners();

    var tabbrowser = FBTestFirebug.getBrowser();
    var removeThese = [];
    for (var i = 0; i < tabbrowser.mTabs.length; i++)
    {
        var tab = tabbrowser.mTabs[i];

        var firebugAttr = tab.getAttribute("firebug");

        FBTest.sysout(i+"/"+tabbrowser.mTabs.length+" cleanUpTestTabs on tab "+tab+" firebug: "+firebugAttr);

        if (firebugAttr == "test")
            removeThese.push(tab);
    }

    if (!tabbrowser._removingTabs)
        tabbrowser._removingTabs = [];

    for (var i = 0; i < removeThese.length; i++)
        tabbrowser.removeTab(removeThese[i]);
};

/**
 * Clears Firefox cache.
 */
this.clearCache = function()
{
    try
    {
        var cache = Cc["@mozilla.org/network/cache-service;1"].getService(Ci.nsICacheService);
        cache.evictEntries(Ci.nsICache.STORE_ON_DISK);
        cache.evictEntries(Ci.nsICache.STORE_IN_MEMORY);
    }
    catch(exc)
    {
        FBTest.sysout("clearCache FAILS "+exc, exc);
    }
};

// ********************************************************************************************* //
}).apply(FBTest);
