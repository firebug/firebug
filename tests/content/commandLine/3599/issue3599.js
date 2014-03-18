function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/3599/issue3599.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {
                    tagName: "div",
                    classes: "logRow",
                    counter: 2
                };

                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panelNode = FBTest.getPanel("console").panelNode;
                    var rows = panelNode.querySelectorAll(".logRow");

                    if (FBTest.compare(2, rows.length, "There must be two logs"))
                    {
                        FBTest.compare("undefined", rows[1].textContent,
                            "The second log must be 'undefined'");
                    }

                    FBTest.testDone();
                });

                // Clear console and execute an expression on the command line.
                FBTest.clearConsole();
                FBTest.executeCommand("var a = 10;");
            });
        });
    });
}
