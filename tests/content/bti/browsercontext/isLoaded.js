
/**
 * Test for BrowserContext#exists()
 *
 * A browser context should exist when a tab is opened. It should no longer exist after
 * being disconnected.
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browsercontext/testScripts.html";
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " + url);
        FBTest.ok(!context.isLoaded(), "Context should no be loaded when created");
        FBTest.testDone();
    });
    browser.addEventListener("onContextLoaded", function(context)
    {
        FBTest.compare(context.getURL(), url, "URL of loaded context should be " + url);
        FBTest.ok(context.isLoaded(), "Context should be loaded after load notification");
        FBTest.testDone();
    });
    FBTest.progress("isLoaded, open test page "+ url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("isLoaded, new tab opened " + url);
    });
}
