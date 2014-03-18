function runTest()
{
    FBTest.openNewTab(basePath + "console/grouping/profiler.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var config = {
                tagName: "div",
                classes: "logRow",
                counter: 2
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FBTest.getPanel("console").panelNode;

                var rows = panelNode.querySelectorAll(".logRow-profile .logCounterValue");
                FBTest.compare(2, rows.length, "There must be two profiler entries");

                FBTest.compare("", rows[0].textContent, "The log counter must be empty");
                FBTest.compare("", rows[1].textContent, "The log counter must be empty");

                FBTest.testDone();
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}
