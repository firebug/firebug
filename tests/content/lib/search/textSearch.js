function runTest()
{
    openNewTab(basePath + "lib/search/textSearch.htm", function(win)
    {
        var root = win.document.getElementById("content");
        FBTest.progress("Document ready state: " + win.document.readyState);
        FBTest.progress("Location: " + win.location);

        if ((win.location + "").indexOf("textSearch.htm") == -1)
        {
            FBTest.ok(false, "Wrong test page location");
            setTimeout(function()
            {
                FBTest.progress("Location again: " + win.location);
                FBTest.testDone();
            }, 800);
            return;
        }

        var documentElement = win.document.documentElement;
        var innerHTML = documentElement ? documentElement.innerHTML :
            "document element not available";

        FBTest.progress("Document innerHTML: " + innerHTML);

        if (!FBTest.ok(root, "The 'content' element must exist."))
        {
            FBTest.testDone();
            return;
        }

        var child = win.document.getElementById("child");

        function compareFind(node, offset, result)
        {
            result = FW.FBL.unwrapObject(result);
            node = FW.FBL.unwrapObject(node);

            FBTest.ok(node === result, "Node matches");
            if (node)
            {
                FBTest.compare(offset, search.range && search.range.startOffset,
                    "Range Start " + offset);
            }
        }

        var search = new FW.FBL.TextSearch(root);

        compareFind(root.firstChild, 0, search.find("a", false, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 3, search.findNext(true, true, false, false));

        compareFind(child.firstChild, 0, search.findNext(true, true, false, false));
        compareFind(child.firstChild, 5, search.findNext(true, true, false, false));

        compareFind(root.lastChild, 4, search.findNext(true, true, false, false));
        compareFind(root.lastChild, 5, search.findNext(true, true, false, false));

        FBTest.compare(undefined, search.findNext(false, true, false, false), "Node matches");
        search.reset();

        compareFind(root.lastChild, 5, search.find("a", true, false));
        compareFind(root.lastChild, 4, search.findNext(true, true, true, false));

        compareFind(child.firstChild, 5, search.findNext(true, true, true, false));
        compareFind(child.firstChild, 0, search.findNext(true, true, true, false));

        compareFind(root.firstChild, 3, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 0, search.findNext(true, true, true, false));
        FBTest.compare(undefined, search.findNext(false, true, true, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 0, search.find("aa", false, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, false, false));

        compareFind(root.lastChild, 4, search.findNext(true, true, false, false));

        FBTest.compare(undefined, search.findNext(false, true, false, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 0, search.find("a", false, false));
        compareFind(child.firstChild, 0, search.findNext(true, false, false, false));
        compareFind(root.lastChild, 4, search.findNext(true, false, false, false));
        FBTest.compare(undefined, search.findNext(false, false, false, false), "Node matches");
        search.reset();

        compareFind(root.lastChild, 5, search.find("a", true, false));
        compareFind(child.firstChild, 5, search.findNext(true, false, true, false));
        compareFind(root.firstChild, 3, search.findNext(true, false, true, false));
        FBTest.compare(undefined, search.findNext(false, false, true, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 0, search.find("aa", false, false));
        compareFind(root.lastChild, 4, search.findNext(true, false, false, false));
        FBTest.compare(undefined, search.findNext(false, false, false, false), "Node matches");
        search.reset();

        compareFind(root.lastChild, 4, search.find("aa", true, false));
        compareFind(root.firstChild, 2, search.findNext(true, false, true, false));
        FBTest.compare(undefined, search.findNext(false, false, true, false), "Node matches");
        search.reset();

        search = new FW.FBL.TextSearch(child.firstChild);
        compareFind(child.firstChild, 0, search.find("a", false, false));
        compareFind(child.firstChild, 5, search.findNext(true, true, false, false));
        compareFind(child.firstChild, 0, search.findNext(true, true, false, false));
        search.reset();

        search = new FW.FBL.TextSearch(root.firstChild);
        compareFind(root.firstChild, 0, search.find("a", false, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 3, search.findNext(true, true, false, false));
        FBTest.compare(undefined, search.findNext(false, true, false, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 3, search.find("a", true, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 0, search.findNext(true, true, true, false));
        FBTest.compare(undefined, search.findNext(false, true, true, false), "Node matches");
        search.reset();

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
    function executeCallback()
    {
        try
        {
            var win = browser.contentWindow;

            FBTest.progress("executeCallback " + win.location);

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
        FBTest.progress("waitForEvents " + event.type + ", " + browser.contentWindow.location);

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

        // Execute callback after 100ms timout (the inspector tests need it for now),
        // but this shoud be set to 0.
        if (loaded && painted)
        {
            FBTest.progress("waitForEvents; loaded+painted " + browser.contentWindow.location);
            setTimeout(executeCallback, 100);
        }
    }

    FBTest.progress("waitForWindowLoad: adding event listener " + browser.contentWindow.location);

    browser.addEventListener("load", waitForEvents, true);
    browser.addEventListener("MozAfterPaint", waitForEvents, true);
}
