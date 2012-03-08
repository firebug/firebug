function runTest()
{
    FBTest.sysout("console.memoryProfile.START");
    FBTest.openNewTab(basePath + "console/api/memoryProfile.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var panel = FBTest.selectPanel("console");
            FBTest.clearConsole();

            var config = {tagName: "tr", classes: "profileRow", counter: 2};
            FBTest.waitForDisplayedElement("console", config, function()
            {
                var panelNode = FBTest.getPanel("console").panelNode;
                var row = panel.panelNode.querySelector(".logRow.logRow-profile");

                var caption = row.querySelector(".profileCaption");
                FBTest.compare(/Fibonacci/, caption.textContent, "Verify table caption.");

                var profileRows = row.getElementsByClassName("profileRow");
                FBTest.compare(2, profileRows.length,
                    "There must be two profile rows (including header)");

                var summaryRows = row.getElementsByClassName("profileSummaryRow");
                FBTest.compare(1, summaryRows.length,
                    "There must be one summary row");

                FBTest.testDone("console.memoryProfile.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
