function runTest()
{
    FBTest.sysout("issue5359.START");
    FBTest.openNewTab(basePath + "console/5359/issue5359.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FBTest.selectPanel("console");
                FBTest.clearConsole();

                var config = {tagName: "tr", classes: "profileRow", counter: 2};
                FBTest.waitForDisplayedElement("console", config, function()
                {

                    var panelNode = FBTest.getPanel("console").panelNode;
                    var row = panel.panelNode.querySelector(".logRow.logRow-profile");

                    var profileRows = row.getElementsByClassName("profileRow");
                    FBTest.compare(3, profileRows.length,
                        "There must be two profile rows (including header)");

                    // Verify function names.
                    FBTest.compare("myFuncA", profileRows[1].childNodes[0].textContent,
                        "myFuncA has proper name.");
                    FBTest.compare("myFuncB", profileRows[2].childNodes[0].textContent,
                        "myFuncB has proper name.");

                    FBTest.testDone("issue5359.DONE");
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
