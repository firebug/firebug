function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/help.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "table", classes: "helpTable"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.ok(true, "Table with available Command Line API must be shown");

                    var config = {tagName: "ul", classes: "tipsList"};
                    FBTest.waitForDisplayedElement("console", config, function(row)
                    {
                        FBTest.ok(true, "Tips for the Command Line must be shown");

                        FBTest.testDone();
                    });
                });

                FBTest.executeCommand("help");
            });
        });
    });
}
