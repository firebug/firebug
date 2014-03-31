
/**
 * Test for BrowserContext#getBrowser()
 *
 * A browser context should point back to its browser
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browsercontext/testScripts.html";
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " +url);
        FBTest.ok(context.getBrowser() == browser, "Context should refer to its browser");
        FBTest.testDone();
    });
    FBTest.progress("getBrowser, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("getBrowser, new tab opened "+url);
    });
}
