function runTest()
{
    var fileName = "index.js";
    var lineNo = 5;

    FBTest.sysout("issue1483.START");
    FBTest.openNewTab(basePath + "script/1483/issue1483.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.clearCache();

        // Enable the Console and Script panel
        FBTest.enableConsolePanel();
        FBTest.enableScriptPanel(function ()
        {
            FBTest.progress("issue1483.script panel enabled");

            var panel = FW.Firebug.chrome.selectPanel("script");
            FBTest.compare("script", panel.name, "The Script panel should be selected");

            var found = FBTest.selectPanelLocationByName(panel, fileName);
            FBTest.ok(found, "The panel location should be "+fileName);

            // Set breakpoint in index.js file at line 5
            FBTest.setBreakpoint(null, fileName, lineNo, null, function()
            {
                FBTest.progress("issue1483.a breakpoint is set");

                var hit = false; // a flag indicating that a break happened.
                var chrome = FW.Firebug.chrome;

                FBTest.waitForBreakInDebugger(chrome, lineNo, true, function()
                {
                    hit = true;
                    FBTest.progress("issue1483.break on the breakpoint");
                    FBTest.removeBreakpoint(chrome, fileName, lineNo, function()
                    {
                        FBTest.clickContinueButton(chrome);
                        FBTest.progress("issue1483.the continue button is pused");
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

                    FBTest.testDone("issue1483.DONE");
                });
            });
        });
    });
}
