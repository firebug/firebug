function runTest()
{
    FBTest.openNewTab(basePath + "console/profiler/profiler.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var panel = FBTest.getSelectedPanel();
            FBTest.clearConsole();

            var config = {tagName: "tr", classes: "profileRow", counter: 2};
            FBTest.waitForDisplayedElement("console", config, function()
            {
                FBTest.progress("profile log created");

                var panelNode = FBTest.getPanel("console").panelNode;
                var row = panel.panelNode.querySelector(".logRow.logRow-profile");

                var caption = row.querySelector(".profileCaption");
                FBTest.compare("Profile", caption.textContent, "Verify table caption.");

                var profileRows = row.querySelectorAll("TBODY .profileRow");
                FBTest.compare(3, profileRows.length,
                    "There must be three profile rows (including header)");

                FBTest.compare(9, profileRows[0].childNodes.length,
                    "There must be 9 columns");

                // Verify some result data.
                FBTest.compare("fib", profileRows[0].childNodes[0].textContent,
                    "The 'fib' function was profiled.");
                FBTest.compare(177, profileRows[0].childNodes[1].textContent,
                    "The 'fib' function was called exactly 177 times.");

                FBTest.testDone();
            });

            var chrome = FW.Firebug.chrome;
            FBTest.clickToolbarButton(chrome, "fbToggleProfiling");

            var iframe = win.document.getElementById("iframe");
            var button = iframe.contentWindow.document.getElementById("testButton");
            FBTest.click(button);

            FBTest.clickToolbarButton(chrome, "fbToggleProfiling");
        });
    });
}
