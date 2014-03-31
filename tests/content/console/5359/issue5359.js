function runTest()
{
    FBTest.openNewTab(basePath + "console/5359/issue5359.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var panelNode = FBTest.getSelectedPanel().panelNode;
                FBTest.clearConsole();

                var config = {tagName: "tr", classes: "profileRow", counter: 2};
                FBTest.waitForDisplayedElement("console", config, function()
                {

                    var row = panelNode.querySelector(".logRow.logRow-profile");

                    var profileRows = row.getElementsByClassName("profileRow");
                    FBTest.compare(3, profileRows.length,
                        "There must be two profile rows (including header)");

                    // Verify function names.
                    FBTest.compare("myFuncA", profileRows[1].childNodes[0].textContent,
                        "myFuncA has proper name.");
                    FBTest.compare("myFuncB", profileRows[2].childNodes[0].textContent,
                        "myFuncB has proper name.");

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
