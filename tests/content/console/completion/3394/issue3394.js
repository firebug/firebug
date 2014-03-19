function runTest()
{
    FBTest.openNewTab(basePath + "console/completion/3394/issue3394.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");

                FBTest.clearAndTypeCommand("loc");
                FBTest.synthesizeKey("VK_TAB", null, win);

                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                FBTest.compare(/^location/, cmdLine.value,
                    "The autocomplete must produce: /^location/");

                FBTest.testDone();
            });
        });
    });
}
