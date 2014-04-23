function runTest()
{
    var url = basePath + "script/breakpoints/7373/issue7373.html";
    FBTest.openNewTab(url, (win) =>
    {
        FBTest.enablePanels(["console", "script"], (win) =>
        {
            var browser = FBTest.getCurrentTabBrowser();

            var listener =
            {
                onBreakpointAdded: function(bp)
                {
                    DebuggerController.removeListener(browser, listener);

                    FBTest.compare(15, bp.lineNo,
                        "The breakpoint must be created on the right line");

                    var config = {tagName: "div", classes: "logRow logRow-log"};
                    FBTest.waitForDisplayedElement("console", config, (row) =>
                    {
                        FBTest.compare("Helloissue7373.html (line 16)", row.textContent,
                            "The proper message must be displayed.");
                        FBTest.testDone();
                    });

                    FBTest.waitForBreakInDebugger(null, 16, false, () =>
                    {
                        FBTest.ok(false, "Break in debugger must not happen");
                        FBTest.testDone();
                    });

                    FBTest.clickContentButton(win, "testButton");
                }
            }

            DebuggerController.addListener(browser, listener);

            FBTest.executeCommand("monitor(executeTest)");
        });
    });
}
