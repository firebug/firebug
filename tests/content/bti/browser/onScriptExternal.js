
/**
 * Test event listener call back for #onScript for a script external to
 * the HTML file.
 *
 * When a page is loaded with an external JavaScript file a script load call back
 * should be generated.
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browser/testExternalScript.html";
    var scriptUrl = FBTest.getHTTPURLBase()+"bti/browser/simpleExternal.js";
    browser.addEventListener("onScript", function(compilationUnit)
    {
        FBTest.compare(compilationUnit.getURL(), scriptUrl,
            "URL of newly loaded script should be " + scriptUrl);
        FBTest.testDone();
    });
    FBTest.progress("onScriptExternal, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("onScriptExternal, new tab opened "+url);
    });
}
