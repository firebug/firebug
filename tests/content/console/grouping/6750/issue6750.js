function runTest()
{
    FBTest.sysout("issue6750.START");
    FBTest.openNewTab(basePath + "console/grouping/6750/issue6750.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            FBTest.clearConsole();

            var config = {
                tagName: "div",
                classes: "logRow"
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.testDone("issue6750.DONE");
            });

            FBTest.click(win.document.getElementById("createLogs"));
        });
    });
}
