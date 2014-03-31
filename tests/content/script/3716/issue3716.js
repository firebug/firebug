function runTest()
{
    FBTest.openNewTab(basePath + "script/3716/issue3716.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FW.Firebug.chrome.selectPanel("script");

            // Wait for breakpoint hit, the breakpoint is set below.
            FBTest.waitForBreakInDebugger(null, 11, true, function()
            {
                FBTest.clickContinueButton();
                FBTest.testDone();
            });

            // Set a breakpoint and reload the page to trigger it.
            FBTest.setBreakpoint(null, "issue3716.html", 11, function()
            {
                FBTest.progress("breakpoint set");
                FBTest.reload();
            })
        });
    });
}
