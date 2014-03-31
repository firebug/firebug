function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "console/completion/3466/issue3466.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");

                FBTest.clearAndTypeCommand("dir(");

                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                FBTest.compare("dir(", cmdLine.value,
                    "Expected value must be in the command line now: " + cmdLine.value);

                FBTest.testDone();
            });
        });
    });
}
