function runTest()
{
    FBTest.openNewTab(basePath + "console/api/clear.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-log"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var expected = /This is a test log\s*/;
                    FBTest.compare(expected, row.textContent, "The proper message must be displayed.");
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
