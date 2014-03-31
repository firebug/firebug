
/**
 * Test for CompilationUnit#getSource(listener) for a JavaScript file external
 * to its HTML file.
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/compilationunit/testScripts.html";
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.progress("getExternalSource, context created");
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " + url);
        FBTest.progress("getExternalSource, retrieving compilation units");
        context.getCompilationUnits(function(units)
        {
            FBTest.progress("getExternalSource, compilation units retrieved");
            var cuURL = FBTest.getHTTPURLBase()+"bti/compilationunit/simpleExternal.js";
            unit = context.getCompilationUnit(cuURL);
            FBTest.ok(unit, "compilation unit does not exist:" + cuURL);
            unti.getSource(function(source)
            {
                FBTest.progress("getExternalSource, source retrieved");
                FBTest.compare(source, "document.write(\"<p>Browser Tools Interface " +
                    "(external source file)<br>\");\r\ndocument.write(\"Another line of " +
                    "text</p>\");", "incorrect source");
                FBTest.testDone();
            });
        });

    });
    FBTest.progress("getExternalSource, open test page "+url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("getExternalSource, new tab opened "+url);
    });
}
