function runTest()
{
    FBTest.setPref("cookies.logEvents", true);

    FBTest.openNewTab(basePath + "console/grouping/cookies.php", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "cookies"], function()
            {
                FBTest.clearConsole();

                var config = {
                    tagName: "div",
                    classes: "logRow-cookie",
                    counter: 3
                };

                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panel = FBTest.getSelectedPanel();
                    var panelNode = panel.panelNode;

                    var rows = panelNode.querySelectorAll(".logRow-cookie .logCounterValue");
                    FBTest.compare(3, rows.length, "There must be three cookie entries");

                    FBTest.compare("", rows[0].textContent, "The log counter must be empty");
                    FBTest.compare("", rows[1].textContent, "The log counter must be empty");
                    FBTest.compare(2, rows[2].textContent, "The log counter must be 2");

                    panel.clear();  // ensure that the console starts scrolled to bottom

                    // Asynchronously wait for result in the Console panel.
                    var config = {tagName: "div", classes: "logRow", count: 3};
                    FBTest.waitForDisplayedElement("console", config, function(row)
                    {
                        var rows = panelNode.getElementsByClassName("logRow");
                        FBTest.compare(">>> document.cookie", rows[rows.length - 3].textContent,
                            "The console should display: >>> document.cookie");
                        FBTest.compare(new RegExp("Name\\\s*Value\\\s*Raw Value\\\s*Domain\\\s*" +
                                "Raw Size\\\s*Size\\\s*Path\\\s*Expires\\\s*Max. Age\\\s*HttpOnly\\\s*" +
                                "Security\\\s*issue4979\\\s*value\\\s*value\\\s*14 B\\\s*14 B"),
                            rows[rows.length - 2].textContent,
                            "The console should display a table containing the cookie data");
                        FBTest.compare("\"issue4979=value\"", rows[rows.length - 1].textContent,
                            "The console should display the raw cookie data");

                        FBTest.testDone();
                    });

                    FBTest.executeCommand("document.cookie");
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}

