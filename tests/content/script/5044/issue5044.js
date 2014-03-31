function runTest()
{
    FBTest.openNewTab(basePath + "script/5044/issue5044.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Enable and switch to the Script panel
            FBTest.enableScriptPanel(function(win)
            {
                // 3. Press Ctrl/⌘+Alt+B
                FBTest.sendShortcut("b", {accelKey: true, altKey: true});

                FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 1, false, function(row)
                {
                    FBTest.clickContinueButton();
                    FBTest.testDone();
                });

                // 4. Click the Say hello button above
                FBTest.clickContentButton(win, "sayHello");
            });
        });
    });
}
