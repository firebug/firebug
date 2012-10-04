function runTest()
{
    FBTest.sysout("issue5336.START");
    FBTest.openNewTab(basePath + "script/watch/5336/issue5336.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("script");

            FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 13, false, function(row)
            {
                FW.Firebug.chrome.selectSidePanel("watches");

                var row = FBTest.getWatchExpressionRow(null, "elements");
                FBTest.ok(row, "The 'elements' expression must be in the watch panel.");

                var expected = /\s*elements\s*HTMLCollection\s*\[\s*div\.test\,\s*div\.test\s*\]\s*/;
                FBTest.compare(expected, row.textContent,
                    "Value of 'elements' must not be undefined.");

                FBTest.clickContinueButton();
                FBTest.testDone("issue5336.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
