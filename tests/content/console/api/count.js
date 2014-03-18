function runTest()
{
    FBTest.openNewTab(basePath + "console/api/count.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                // Don't forget to select the console panel (so the Clear button is visible).
                FBTest.selectPanel("console");
                FBTest.clearConsole();

                var config = {tagName: "div", classes: "logRow", counter: 2};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panelNode = FBTest.getPanel("console").panelNode;
                    var rows = panelNode.getElementsByClassName("logRow");
                    if (FBTest.compare(2, rows.length, "There must be 2 logs displayed."))
                    {
                        FBTest.compare(new RegExp("a\\s*3" +
                            FW.FBL.$STRF("Line", ["count.html", 32]).replace(/([\\"'\(\)])/g, "\\$1")),
                            rows[0].textContent,
                            "The proper message must be displayed.");

                        FBTest.compare(new RegExp("b\\s*2" +
                            FW.FBL.$STRF("Line", ["count.html", 35]).replace(/([\\"'\(\)])/g, "\\$1")),
                            rows[1].textContent,
                            "The proper message must be displayed.");
                    }
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
