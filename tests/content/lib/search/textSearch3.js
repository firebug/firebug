function runTest()
{
    iterateBrowserTabs(function(browser)
    {
        FBTest.progress("tab " + browser.contentWindow.location)
    });

    openNewTab(basePath + "lib/search/textSearch3.html", function(win)
    {
        var root = win.document.getElementById("content");
        FBTest.progress("Document ready state: " + win.document.readyState);
        FBTest.progress("Location: " + win.location);

        iterateBrowserTabs(function(browser)
        {
            FBTest.progress("tab " + browser.contentWindow.location)
        });

        var tabBrowser = FW.Firebug.Firefox.getTabBrowser();
        FBTest.progress("tabBrowser.selectedBrowser " +
            tabBrowser.selectedBrowser.contentWindow.location);

        if ((win.location + "").indexOf("textSearch") == -1)
        {
            FBTest.ok(false, "Wrong test page location");
            setTimeout(function()
            {
                FBTest.progress("Location again: " + win.location);
                FBTest.testDone();
            }, 800);
            return;
        }

        FBTest.ok(root, "The 'content' element must exist.");

        FBTest.testDone();
    });
}

function openNewTab(url, callback)
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

function waitForWindowLoad(browser, callback)
{
    // If the callback isn't specified don't watch the window load at all.
    if (!callback)
        return;

    var loaded = false;
    var painted = false;

    // All expected events have been fired, execute the callback.
    function executeCallback(win)
    {
        try
        {
            FBTest.progress("executeCallback browser.contentWindow: " + browser.contentWindow.location);
            FBTest.progress("executeCallback win: " + win.location);

            var tabBrowser = FW.Firebug.Firefox.getTabBrowser();
            FBTest.progress("tabBrowser.selectedBrowser " +
                tabBrowser.selectedBrowser.contentWindow.location);

            if (!win)
                FBTrace.progress("waitForWindowLoad: ERROR no window!");

            // The window is loaded, execute the callback now.
            if (win)
                callback(win);
        }
        catch (exc)
        {
            FBTest.progress("waitForWindowLoad " + exc);
        }
    }

    function waitForEvents(event)
    {
        var win = browser.contentWindow;
        FBTest.progress("waitForEvents " + event.type + ", " + win.location);

        if (event.type == "load" && event.target === browser.contentDocument)
        {
            browser.removeEventListener("load", waitForEvents, true);
            loaded = true;
        }
        else if (event.type == "MozAfterPaint" && event.target === win)
        {
            browser.removeEventListener("MozAfterPaint", waitForEvents, true);
            painted = true;
        }

        // Execute callback after 100ms timout (the inspector tests need it for now),
        // but this shoud be set to 0.
        if (loaded && painted)
        {
            var tabBrowser = FW.Firebug.Firefox.getTabBrowser();
            FBTest.progress("tabBrowser.selectedBrowser " +
                tabBrowser.selectedBrowser.contentWindow.location);

            FBTest.progress("waitForEvents; loaded+painted " + win.location);
            setTimeout(function()
            {
                executeCallback(win);
            }, 100);
        }
    }

    FBTest.progress("waitForWindowLoad: adding event listener " + browser.contentWindow.location);

    browser.addEventListener("load", waitForEvents, true);
    browser.addEventListener("MozAfterPaint", waitForEvents, true);
}

function iterateBrowserTabs(callback)
{
    var tabBrowser = FW.Firebug.Firefox.getTabBrowser();
    var numTabs = tabBrowser.browsers.length;
    for(var index=0; index<numTabs; index++)
    {
        var currentBrowser = tabBrowser.getBrowserAtIndex(index);
        if (callback(currentBrowser))
            return true;
    }

    return false;
};

