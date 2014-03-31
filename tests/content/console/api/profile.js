function runTest()
{
    FBTest.progress("profile start");
    FBTest.openNewTab(basePath + "console/api/profile.html", function(win)
    {
        FBTest.progress("tab opened");

        var actualTest = function(win)
        {
            FBTest.progress("script panel enabled");

            var panel = FBTest.selectPanel("console");
            FBTest.clearConsole();

            var config = {tagName: "tr", classes: "profileRow", counter: 2};
            FBTest.waitForDisplayedElement("console", config, function()
            {
                FBTest.progress("profile log created");

                var panelNode = FBTest.getPanel("console").panelNode;
                var row = panel.panelNode.querySelector(".logRow.logRow-profile");

                var caption = row.querySelector(".profileCaption");
                FBTest.compare("Fibonacci", caption.textContent, "Verify table caption.");

                var profileRows = row.getElementsByClassName("profileRow");
                FBTest.compare(2, profileRows.length,
                    "There must be two profile rows (including header)");

                FBTest.compare(9, profileRows[0].childNodes.length,
                    "There must be 9 columns");

                // Verify some result data.
                FBTest.compare("fib", profileRows[1].childNodes[0].textContent,
                    "The 'fib' function was profiled.");
                FBTest.compare(21891, profileRows[1].childNodes[1].textContent,
                    "The 'fib' function was called exactly 242785 times.");
                FBTest.compare("100%", profileRows[1].childNodes[2].textContent,
                    "Only the 'fib' function was executed.");
                FBTest.compare(FW.FBL.$STRF("Line", ["profile.html", 15]),
                    profileRows[1].childNodes[8].textContent,
                    "The source link must be correct.");

                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        };

        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.progress("console panel enabled");

                var expected = FW.FBL.$STR("ProfilerRequiresTheScriptPanel");
                FBTest.executeCommandAndVerify(function()
                {
                    FBTest.enableScriptPanel(actualTest);
                }, "console.profile();", expected, "div", "logRow-warn", true);
            });
        });
    });
}
