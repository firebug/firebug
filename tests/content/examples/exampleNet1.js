function runTest()
{
    FBTest.sysout("exampleNet1.START");
    FBTest.openNewTab(basePath + "examples/exampleNet1.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableNetPanel(function(win)
        {
            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                // TODO: test code, verify UI, etc.

                FBTest.testDone("exampleNet1.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
