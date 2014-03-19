function runTest()
{
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "console/spy/2712/issue2712.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                // Wait for request being displayed in the Console panel.
                FBTest.waitForDisplayedElement("console", null, function(row)
                {
                    FBTest.ok(!FW.FBL.hasClass(row, "error"),
                        "The request must not be marked as 'aborted'.");
                    FBTest.testDone();
                });

                // Execute test on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
