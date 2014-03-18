// 1) Load test case page.
// 2) Open Firebug and enable the Console panel
// 3) Reload
// 4) Verify number of logs (must be == 1)
// 5) Click the Persist button.
// 6) Reload
// 7) Verify number of logs (must be == 2)
function runTest()
{
    FBTest.openNewTab(basePath + "console/2659/issue2659.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FW.Firebug.chrome.selectPanel("console");
                FBTest.reload(function()
                {
                    verifyNumberOfLogs(1);
                    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbConsolePersist");
                    FBTest.reload(function()
                    {
                        verifyNumberOfLogs(2);
                        FBTest.testDone();
                    })
                })
            });
        });
    });
}

function verifyNumberOfLogs(expectedCount)
{
    var panel = FBTest.getPanel("console");
    var logs = panel.panelNode.getElementsByClassName("logRow logRow-log");

    var count = 0;
    for (var i=0; i<logs.length; i++)
    {
        if (logs[i].textContent.indexOf("Test log for issue2659") == 0)
            count++
    }

    FBTest.compare(expectedCount, count, "There must be " + expectedCount +
        "log(s) in the Console panel");
}
