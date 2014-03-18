
/**
 * Test event listener call back for #onScript for a script embedded
 * in HTML.
 *
 * When a page is loaded with embedded JavaScript in HTML a script load call back
 * should be generated.
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browser/testGetContexts.html";
    browser.addEventListener("onScript", function(compilationUnit)
    {
        FBTest.compare(compilationUnit.getURL(), url, "URL of newly loaded script should be " + url);
        FBTest.testDone();
    });
    FBTest.progress("onScriptEmbedded, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("onScriptEmbedded, new tab opened "+url);
    });
}
