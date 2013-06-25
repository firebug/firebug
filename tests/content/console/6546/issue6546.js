function runTest()
{
    FBTest.sysout("issue6546.START");

    FBTest.openNewTab(basePath + "console/6546/issue6546.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var doc = FW.Firebug.chrome.window.document;
            FBTest.compare("textbox-input", doc.activeElement.className, "Command Line must be focused");

            FBTest.testDone("issue6546.DONE");
        });
    });
}
