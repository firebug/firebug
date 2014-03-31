function runTest()
{
    FBTest.openNewTab(basePath + "console/3292/issue3292.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel();

            var config = {
                tagName: "div",
                classes: "logRow logRow-log",
                counter: 3
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panel = FBTest.getSelectedPanel();
                var logContents = panel.panelNode.getElementsByClassName("logContent");

                // Verify the log content
                FBTest.compare(/parent log/, logContents[0].textContent,
                    "\"parent log\" must be displayed");

                FBTest.compare(/include log/, logContents[1].textContent,
                    "\"include log\" must be displayed");
                var logCounter = FW.FBL.getAncestorByClass(logContents[1], "logRow").
                    getElementsByClassName("logCounter").item(0);
                FBTest.compare(2, logCounter.textContent, "\"include log\" must be logged twice");

                FBTest.compare(/iframe log/, logContents[2].textContent,
                    "\"iframe log\" must be displayed");

                FBTest.testDone();
            });

            FBTest.reload();
        });
    });
}
