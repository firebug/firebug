
/**
 * Test event listener call back for #onContextLoaded
 *
 * When a new tab is opened, a loaded call back should be triggered
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browser/testGetContexts.html";
    browser.addEventListener("onContextLoaded", function(context)
    {
        FBTest.compare(context.getURL(), url, "URL of newly loaded context should be " + url);
        FBTest.testDone();
    });
    FBTest.progress("onContextLoaded, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("onContextLoaded, new tab opened "+url);
    });
}
