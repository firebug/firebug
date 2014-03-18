function runTest()
{
    FBTest.openNewTab(basePath + "script/callstack/4415/issue4415.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var stackPanel = FBTest.selectSidePanel("callstack");

            FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 19, false, function(row)
            {
                var panelNode = stackPanel.panelNode;

                var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
                FBTest.compare(4, frames.length, "There must be four frames");

                FBTest.clickContinueButton();
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
