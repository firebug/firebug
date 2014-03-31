
/**
 * Test for Browser#getFocusBrowserContext(id)
 *
 * The focus browser context updates as new tabs are opened
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browser/testGetContexts.html";
    FBTest.progress("getFocusContext(), get initial set of contexts");
    var contexts = browser.getBrowserContexts();
    FBTest.progress("getFocusContext(), open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        var nextContexts = browser.getBrowserContexts();
        FBTest.ok(nextContexts.length == (contexts.length + 1), "Should be a new browser context");
        var context = nextContexts[nextContexts.length - 1];
        if (context)
        {
            FBTest.compare(context.getURL(), url, "The URL should be " + url);
            var focus = browser.getFocusBrowserContext();
            FBTest.compare(focus.getId(), context.getId(), "The focus context id should be " +
                context.getId());
        }
        else
        {
            FBTest.ok(context, "missing new browser context");
        }
        FBTest.testDone();
    });
}
