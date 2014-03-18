function runTest()
{
    FBTest.openNewTab(basePath + "console/5033/issue5033.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["script", "console"], function()
            {
                FBTest.waitForBreakInDebugger(null, 10, true, function()
                {
                    FBTest.waitForDebuggerResume(function ()
                    {
                        var panelNode = FBTest.selectPanel("console").panelNode;

                        var config = {
                            tagName: "div",
                            classes: "logRow",
                            onlyMutations: true
                        };

                        FBTest.waitForDisplayedElement("console", config, function(row)
                        {
                            var result = panelNode.querySelector(".logRow:not(.logRow-command)");

                            if (FBTest.ok(result, "Result must exist"))
                                FBTest.compare(20, result.textContent, "Result must be correct");

                            FBTest.testDone();
                        });
                    });

                    // Click step over five times to resume the debugger.
                    FBTest.waitForBreakInDebugger(null, 11, false, function()
                    {
                        FBTest.waitForBreakInDebugger(null, 12, false, function()
                        {
                            FBTest.waitForBreakInDebugger(null, 12, false, function()
                            {
                                FBTest.clickStepOverButton();
                            });
                            FBTest.clickStepOverButton();
                        });
                        FBTest.clickStepOverButton();
                    });
                    FBTest.clickStepOverButton();
                });

                var url = basePath + "console/5033/issue5033.html";
                FBTest.setBreakpoint(null, url, 10, null, function()
                {
                    FBTest.progress("breakpoint set");
                    FBTest.selectPanel("console");
                    FBTest.executeCommand("testFunction()");
                });
            });
        });
    });
}
