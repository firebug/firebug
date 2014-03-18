function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/3709/issue3709.htm", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");

                // Test Command Line
                FBTest.clearAndTypeCommand("document.getElementById()");
                FBTest.synthesizeKey("VK_LEFT", null, win);
                FBTest.typeCommand("ab");

                FBTest.compare("document.getElementById(ab)", cmdLine.value,
                    "Content of Command Line must be: document.getElementById(ab)");

                FBTest.testDone();
            });
        });
    });
}