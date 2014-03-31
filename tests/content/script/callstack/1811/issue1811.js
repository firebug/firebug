function runTest()
{
    FBTest.openNewTab(basePath + "script/callstack/1811/issue1811.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("script");

            // Asynchronously wait for break in debugger.
            FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 14, false, function(row)
            {
                var stackPanel = FW.Firebug.chrome.selectSidePanel("callstack");
                var panelNode = stackPanel.panelNode;

                // There should be 3 frames.
                var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
                if (FBTest.compare(3, frames.length, "There must be four frames"))
                {
                    FBTest.compare(/customDisplayName/, frames[0].textContent,
                        "The function name must be correct ");

                    FBTest.compare(/onExecuteTest/, frames[1].textContent,
                        "The function name must be correct ");

                    FBTest.compare(/onclick/, frames[2].textContent,
                        "The function name must be correct ");
                }

                // Finish the test.
                FBTest.clickContinueButton();
                FBTest.testDone();
            });

            // Run test to break in debugger.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
