function runTest()
{
    FBTest.sysout("commandline.help.START");
    FBTest.openNewTab(basePath + "commandLine/api/help.html", function(win)
    {
        FBTest.openFirebug();
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

                    FBTest.testDone("commandline.help.DONE");
                });
            });

            FBTest.executeCommand("help");
        });
    });
}
