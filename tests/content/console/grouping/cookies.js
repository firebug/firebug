function runTest()
{
    FBTest.sysout("cookiesGrouping.START");
    FBTest.setPref("cookies.logEvents", true);

    FBTest.openNewTab(basePath + "console/grouping/cookies.php", function(win)
    {
        FBTest.openFirebug();
        FBTestFireCookie.enableCookiePanel();

        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win)
        {
            FBTest.clearConsole();

            var config = {
                tagName: "div",
                classes: "logRow-cookie",
                counter: 3
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FBTest.getPanel("console").panelNode;

                var rows = panelNode.querySelectorAll(".logRow-cookie .logCounterValue");
                FBTest.compare(3, rows.length, "There must be three cookie entries");

                FBTest.compare("", rows[0].textContent, "The log counter must be empty");
                FBTest.compare("", rows[1].textContent, "The log counter must be empty");
                FBTest.compare(2, rows[2].textContent, "The log counter must be 2");

                FBTest.testDone("cookiesGrouping.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

