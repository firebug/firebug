function runTest()
{
    var url = basePath + "script/breakpoints/7295/issue7295.html";
    FBTest.openNewTab(url, (win) =>
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, url, 10, null, (row) =>
            {
                FBTest.progress("Breakpoint set");
                FBTest.disableScriptPanel(function()
                {
                    FBTest.progress("Script panel disabled");
                    FBTest.enableScriptPanel(function(win)
                    {
                        FBTest.progress("Script panel enabled");
                        FBTest.waitForBreakInDebugger(null, 10, false, function(row)
                        {
                            FBTest.progress("Breakpoint hit");
                            FBTest.clickContinueButton();
                            FBTest.testDone();
                        });

                        FBTest.clickContentButton(win, "testButton");
                    });
                });
            });
        });
    });
}
