
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
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " +url);
        FBTest.ok(context.exists(), "Context should exist when created");
        browser.disconnect();
        FBTest.ok(!context.exists(), "Context should not exist when disconnected");
        FBTest.testDone();
    });
    FBTest.progress("exists, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("exists, new tab opened "+url);
    });
}
