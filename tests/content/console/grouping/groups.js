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
                counter: 4
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FBTest.getPanel("console").panelNode;
                var rows = panelNode.querySelectorAll(
                    ".logRow-group > DIV > .logCounter");

                FBTest.compare(4, rows.length, "There must be four console.group() entries");
                FBTest.compare("", rows[0].textContent, "The log counter must be empty");
                FBTest.compare("", rows[1].textContent, "The log counter must be empty");

                var cascadedGroups = panelNode.querySelectorAll(".logGroupBody > .logRow-group");
                FBTest.compare(1, cascadedGroups.length, "There must be one cascaded group");

                FBTest.testDone("groupGrouping.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

