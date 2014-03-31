function runTest()
{
    // 1) Open test page
    FBTest.openNewTab(basePath + "dom/2558/issue2558.html", (win) =>
    {
        // 2) Open Firebug and enable the Script panel.
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                // Wait for break in debugger.
                var chrome = FW.Firebug.chrome;
                FBTest.waitForBreakInDebugger(chrome, 33, false, (sourceRow) =>
                {
                    FBTest.progress("issue2558; Halted on debugger keyword.");
                    FW.Firebug.chrome.selectSidePanel("watches");
                    var watchPanel = FW.Firebug.currentContext.getPanel("watches", true);
                    FBTest.ok(watchPanel, "The watch panel must be there");

                    // 4) Create new watch expression 'arguments'.
                    watchPanel.addWatch("arguments");

                    var config = {
                        tagName: "div",
                        classes: "memberRow watchRow hasChildren"
                    };

                    FBTest.waitForDisplayedElement("watches", config, (watchEntry) =>
                    {
                        // 5) Check evaluated expression.
                        FBTest.ok(watchEntry, "There must be an expandable watch entry");

                        // Resume debugger, test done.
                        FBTest.clickContinueButton();
                        FBTest.testDone();
                    });
                });

                // 3) Execute test on the page (use async to have clean callstack).
                setTimeout(() =>
                {
                    FBTest.click(win.document.getElementById("testButton"));
                }, 10);
            });
        });
    });
}
