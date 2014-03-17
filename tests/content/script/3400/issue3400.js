function runTest()
{
    FBTest.openNewTab(basePath + "script/3400/issue3400.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var chrome = FW.Firebug.chrome;
            FBTest.waitForBreakInDebugger(chrome, 21, false, function(row)
            {
                var doc = chrome.window.document;
                var button = doc.getElementById("fbStepOutButton");
                var toolbar = doc.getElementById("fbToolbar");
                var rect = button.getClientRects()[0];

                FBTest.progress("script panel toolbar width: " + toolbar.clientWidth +
                    ", step-out button right side: " + rect.right);

                // The browser window can be so small that even if the bread-crumbs
                // is shrank there is not enough space to see the buttons. In such
                // case we need to check the the bread-crumbs is really shrank
                if (toolbar.clientWidth < rect.right)
                {
                    var panelStatus = doc.getElementById("fbPanelStatus");
                    FBTest.compare(0, panelStatus.width,
                        "Panel status must have zero width (browser window is small)");
                }
                else
                {
                    FBTest.ok(true, "Debugger buttons must be visible");
                }

                // Resume debugger and finish the test.
                FBTest.clickContinueButton();
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
