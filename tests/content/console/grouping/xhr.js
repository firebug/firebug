function runTest()
{
    FBTest.openNewTab(basePath + "console/grouping/xhr.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.clearConsole();

                var config = {
                    tagName: "div",
                    classes: "logRow-spy",
                    counter: 2
                };

                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panelNode = FBTest.getPanel("console").panelNode;

                    var rows = panelNode.querySelectorAll(".logRow-spy .logCounterValue");
                    FBTest.compare(2, rows.length, "There must be two XHR entries");

                    FBTest.compare("", rows[0].textContent, "The log counter must be empty");
                    FBTest.compare("", rows[1].textContent, "The log counter must be empty");

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}

