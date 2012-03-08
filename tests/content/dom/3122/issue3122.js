function runTest()
{
    FBTest.sysout("issue3122.START");
    FBTest.openNewTab(basePath + "dom/3122/issue3122.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel(function()
        {
            FBTest.selectPanel("script");

            // Wait for break in debugger.
            var chrome = FW.Firebug.chrome;
            FBTest.waitForBreakInDebugger(chrome, 35, false, function(sourceRow)
            {
                FW.Firebug.chrome.selectSidePanel("watches");

                var row = FBTest.getWatchExpressionRow(null, "err");
                FBTest.ok(row, "The 'err' expression must be in the watch panel.");

                // Resume debugger, test done.
                FBTest.clickContinueButton();
                FBTest.testDone("issue3122; DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
