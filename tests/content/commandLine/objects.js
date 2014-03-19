function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/objects.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "a", classes: "objectLink-Date"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.testDone();
                });

                FBTest.executeCommand("new Date('15/02/2011 10:00')");
            });
        });
    });
}
