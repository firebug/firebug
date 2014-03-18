
/**
 * Test event listener call back for #onContextCreated
 *
 * When a new tab is opened, a call back should be triggered
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browser/testGetContexts.html";
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " + url);
        FBTest.testDone();
    });
    FBTest.progress("onContextCreated, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("onContextCreated, new tab opened "+url);
    });
}
