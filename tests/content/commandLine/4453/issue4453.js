function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4453/issue4453.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FBTest.selectPanel("console");
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");

                FBTest.clearCommand();
                FBTest.typeCommand("text");

                FBTest.selectPanel("html");
                FBTest.selectPanel("console");

                FBTest.compare("text", cmdLine.value, "Content of Command Line must be: 'text'");

                FBTest.sendShortcut("a", {accelKey: true}, win);
                FBTest.sendShortcut("VK_DELETE", null, win);

                FBTest.selectPanel("html");
                FBTest.selectPanel("console");

                FBTest.compare("", cmdLine.value, "Content of Command Line must be empty");

                FBTest.testDone();
            });
        });
    });
}
