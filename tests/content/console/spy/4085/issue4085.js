function runTest()
{
    FBTest.setPref("showXMLHttpRequests", true);
    FBTest.openNewTab(basePath + "console/spy/4085/issue4085.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var options = {
                    tagName: "div",
                    classes: "logRow logRow-errorMessage",
                    counter: 1
                };

                FBTest.waitForDisplayedElement("console", options, function(row)
                {
                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
