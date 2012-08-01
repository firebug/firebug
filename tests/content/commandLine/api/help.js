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
                FBTest.testDone("commandline.help.DONE");
            });

            FBTest.executeCommand("help");
        });
    });
}
