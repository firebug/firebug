function runTest()
{
    FBTest.openNewTab(basePath + "examples/exampleCommandLine1.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "span", classes: "objectBox objectBox-number"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare("3", row.textContent, "Number 3 must be displayed");
                    FBTest.testDone();
                });

                FBTest.executeCommand("1+2");
            });
        });
    });
}
