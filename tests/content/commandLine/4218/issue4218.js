function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4218/issue4218.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");

                // Make sure the Console is focused and command line API loaded
                FBTest.focus(cmdLine);
                FBTest.clearCommand();

                // Type '1' into the Command Line and press Enter key
                FBTest.typeCommand("1");
                FBTest.synthesizeKey("VK_RETURN", null, win);

                // Type '2' into the Command Line and press Enter key
                FBTest.typeCommand("2");
                FBTest.synthesizeKey("VK_RETURN", null, win);

                FBTest.synthesizeKey("VK_UP", null, win);
                FBTest.compare("2", cmdLine.value, "The Command Line must display '2' after re-calling the previous command from the history.");

                FBTest.synthesizeKey("VK_RETURN", null, win);

                FBTest.synthesizeKey("VK_UP", null, win);
                FBTest.compare("2", cmdLine.value, "The Command Line must display '2' after re-calling the previous command from the history.");

                FBTest.testDone();
            });
        });
    });
}