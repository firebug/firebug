function runTest()
{
    var url = basePath + "script/breakpoints/5525/issue5525.html";
    FBTest.openNewTab(url, function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var text = "var test = undefinedVariable;";
            FBTest.waitForDisplayedText("console", text, function()
            {
                var panel = FBTest.getSelectedPanel();
                var row = panel.panelNode.getElementsByClassName("logRow-errorMessage")[0];
                var source = panel.panelNode.querySelector(
                    ".logRow-errorMessage .errorSourceCode");

                // Verify displayed text.
                var reTextContent = /\s*var test = undefinedVariable;s*/;
                FBTest.compare(reTextContent, source.textContent, "Text content must match.");

                // Create error breakpoint by clickin on the error-breakpoint circle.
                var br = row.getElementsByClassName("errorBreak")[0];
                FBTest.click(br);

                // Now wait till the breakpoint is (asynchronously) created
                // on the server side.
                FBTest.waitForBreakpoint(url, 12, () =>
                {
                    FBTest.progress("breakpoint created");

                    // Switch to the Script and Breakpoints panels.
                    FBTest.selectPanel("script");
                    var panel = FBTest.selectSidePanel("breakpoints");

                    // Check content of the Breakpoints panel
                    var panelNode = panel.panelNode;
                    var rows = panelNode.getElementsByClassName("breakpointRow");
                    FBTest.compare(1, rows.length, "There must be one breakpoint");

                    // Finish test
                    FBTest.testDone();
                });
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}
