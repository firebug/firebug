function runTest()
{
    FBTest.sysout("groupGrouping.START");

    FBTest.openNewTab(basePath + "console/grouping/groups.html", function(win)
    {
        FBTest.openFirebug();

        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win)
        {
            FBTest.clearConsole();

            var config = {
                tagName: "div",
                classes: "logRow-group",
                counter: 2
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FBTest.getPanel("console").panelNode;
                var rows = panelNode.querySelectorAll(
                    ".panelNode > .logRow-group > DIV > .logCounter");

                FBTest.compare(2, rows.length, "There must be two console.group() entries");
                FBTest.compare("", rows[0].textContent, "The log counter must be empty");
                FBTest.compare("", rows[1].textContent, "The log counter must be empty");

                FBTest.testDone("groupGrouping.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

