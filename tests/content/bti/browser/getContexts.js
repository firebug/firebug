
/**
 * Test for Browser#getBrowserContexts()
 *
 * When a new tab is opened, a new context should appear in the returned array.
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browser/testGetContexts.html";
    FBTest.progress("getContexts, get initial set of contexts");
    var contexts = browser.getBrowserContexts();
    FBTest.progress("getContexts, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        var nextContexts = browser.getBrowserContexts();
        FBTest.ok(nextContexts.length == (contexts.length + 1), "Should be a new browser context");
        var context = nextContexts[nextContexts.length - 1];
        if (context)
            FBTest.compare(context.getURL(), url, "The URL should be " + url);
        else
            FBTest.ok(context, "missing new browser context");
        FBTest.testDone();
    });
}
