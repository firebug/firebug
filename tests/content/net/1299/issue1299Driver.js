function runTest()
{
    var pageURI = basePath + "net/1299/issue1299.html";
    var scriptURI = basePath + "net/1299/issue1299.js";

    FBTest.clearCache();
    FBTest.openNewTab(pageURI, function(win)
    {
        FBTest.enablePanels(["net", "script"], function() {
            // Remove issue1299.js from Firebug cache.
            FW.Firebug.currentContext.sourceCache.invalidate(scriptURI);

            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Let's load the issue1299.js file again. It's already
            // included within the test page so, it must be in
            // Firefox cache now.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                // OK, the script file must be in Firebug cache again.
                var text = FW.Firebug.currentContext.sourceCache.loadText(scriptURI);

                var expectedText = "function issue1299() { return \"issue1299\"; }";
                FBTest.compare(expectedText, text,
                    "Firebug should cache even files coming directly from Firefox cache.");

                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
