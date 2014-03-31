function runTest()
{
    FBTest.openNewTab(basePath + "console/spy/2462/issue2462.html", function(win)
    {
        FBTest.enableConsolePanel(function()
        {
            var options = {
                tagName: "div",
                classes: "logRow logRow-spy error loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("console", options, function(logRow)
            {
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
