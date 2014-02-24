function runTest()
{
    FBTest.sysout("exampleNet1.START");
    FBTest.openNewTab(basePath + "examples/exampleNet1.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                var options = {
                    tagName: "tr",
                    classes: "netRow category-xhr hasHeaders loaded"
                };

                // Wait till a 'HTTP request' entry is displayed in the Net panel.
                FBTest.waitForDisplayedElement("net", options, function(row)
                {
                    FBTest.progress("exampleNet1; two entries displayed");
                    FBTest.testDone("exampleNet1.DONE");
                });
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
