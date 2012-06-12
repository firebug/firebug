function runTest()
{
    FBTest.sysout("issue5525.START");
    FBTest.openNewTab(basePath + "script/breakpoints/5525/issue5525.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel()
        FBTest.enableConsolePanel()
        FBTest.selectPanel("console");

        var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
        FBTest.waitForDisplayedElement("console", config, function(row)
        {
            // Verify displayed text.
            var reTextContent = /ReferenceError\:\s*undefinedVariable is not defined\s*var test = undefinedVariable;\s*issue5525.html\s*\(line 10\)/;
            FBTest.compare(reTextContent, row.textContent, "Text content must match.");

            // Create error breakpoint
            var br = row.querySelector(".errorBreak");
            FBTest.click(br);

            // Switch to the Script and Breakpoints panels.
            FBTest.selectPanel("script");
            var panel = FBTest.selectSidePanel("breakpoints");

            // Check content of the Breakpoints panel
            var panelNode = panel.panelNode;
            var rows = panelNode.querySelectorAll(".breakpointRow");
            FBTest.compare(rows.length, 1, "There must be one breakpoint");

            // Finish test
            FBTest.testDone("console.error.DONE");
        });

        FBTest.reload();
    });
}
