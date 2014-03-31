function runTest()
{
    var url = basePath + "script/1483/index.js";
    var fileName = "index.js";
    var lineNo = 5;

    FBTest.openNewTab(basePath + "script/1483/issue1483.html", function(win)
    {
        FBTest.clearCache();
        FBTest.enablePanels(["script", "console"], function ()
        {
            var panel = FBTest.getSelectedPanel();
            FBTest.compare("script", panel.name, "The Script panel should be selected");

            var found = FBTest.selectPanelLocationByName(panel, fileName);
            FBTest.ok(found, "The panel location should be " + fileName);

            // Set breakpoint in index.js file at line 5
            FBTest.setBreakpoint(null, url, lineNo, null, function()
            {
                FBTest.progress("issue1483.a breakpoint is set");

                var hit = false; // a flag indicating that a break happened.
                var chrome = FW.Firebug.chrome;

                FBTest.waitForBreakInDebugger(chrome, lineNo, true, function()
                {
                    hit = true;

                    FBTest.progress("issue1483.break on the breakpoint");
                    FBTest.removeBreakpoint(chrome, url, lineNo, function()
                    {
                        FBTest.clickContinueButton(chrome);
                        FBTest.progress("issue1483.the continue button is paused");
                    });
                });

                // Reload the page, the breakpoint should hit during the reload.
                FBTest.reload(function()
                {
                    FBTest.progress("issue1483.page reloaded");
                    FBTest.ok(hit, "The break happened");

                    // Check the Console panel
                    var panelNode = FBTest.selectPanel("console").panelNode;
                    var selector = ".logRow.logRow-log .objectBox.objectBox-text";
                    var log = panelNode.querySelector(selector);

                    FBTest.compare("init", (log ? log.textContent : ""),
                        "there must be one log in the console.");

                    FBTest.testDone();
                });
            });
        });
    });
}
