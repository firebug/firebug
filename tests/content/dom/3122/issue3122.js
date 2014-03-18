function runTest()
{
    FBTest.openNewTab(basePath + "dom/3122/issue3122.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                // Wait for break in debugger.
                var chrome = FW.Firebug.chrome;
                FBTest.waitForBreakInDebugger(chrome, 36, false, function(sourceRow)
                {
                    FW.Firebug.chrome.selectSidePanel("watches");

                    var row = FBTest.getWatchExpressionRow(null, "err");
                    FBTest.ok(row, "The 'err' expression must be in the watch panel.");

                    // Resume debugger, test done.
                    FBTest.clickContinueButton();
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
