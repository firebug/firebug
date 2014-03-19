
/**
 * Test for BrowserContext#getCompilationUnits() and #getCompilationUnit(url)
 * Also tests CompilationUnit#getURL() and CompilationUnit#getBrowserContext()
 *
 * A HTML file with two scripts (one internal, one external).
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/browsercontext/testScripts.html";
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.progress("getCompilationUnits, context created");
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " +url);
        FBTest.progress("getCompilationUnits, retrieving compilation units");
        context.getCompilationUnits(function(units)
        {
            FBTest.progress("getCompilationUnits, compilation units retrieved");
            FBTest.compare(2, units.length, "Should be two compilation units");
            var unit = context.getCompilationUnit(url);
            FBTest.ok(unit, "compilation unit does not exist: " + url);
            FBTest.compare(url, unit.getURL(), "compilation unit URL is not consistent");
            FBTest.ok(unit.getBrowserContext() == context, "compilation unit browser context is " +
                "not consistent");
            var other = FBTest.getHTTPURLBase()+"bti/browsercontext/simpleExternal.js";
            unit = context.getCompilationUnit(other);
            FBTest.ok(unit, "compilation unit does not exist:" + other);
            FBTest.compare(other, unit.getURL(), "compilation unit URL is not consistent");
            FBTest.ok(unit.getBrowserContext() == context, "compilation unit browser context is " +
                "not consistent");
            FBTest.testDone();
        });

    });
    FBTest.progress("getCompilationUnits, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("getCompilationUnits, new tab opened "+url);
    });
}
