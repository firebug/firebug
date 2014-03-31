function runTest()
{
    FBTest.openNewTab(basePath + "console/6546/issue6546.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Enable and switch to the Console panel
            FBTest.enableConsolePanel(() =>
            {
                var doc = FW.Firebug.chrome.window.document;
                FBTest.compare("textbox-input", doc.activeElement.className,
                    "Command Line must be focused");

                FBTest.testDone();
            });
        });
    });
}
