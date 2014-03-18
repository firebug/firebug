
/**
 * Test for BrowserContext#getJavaScriptContext()
 *
 * A browser context should have a JavaScriptContext if it has scripts.
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browsercontext/testScripts.html";
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " + url);
        FBTest.ok(context.getJavaScriptContext(), "JavaScriptContext should exist when created");
        FBTest.testDone();
    });
    FBTest.progress("getJavaScriptContext, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("getJavaScriptContext, new tab opened "+url);
    });
}
