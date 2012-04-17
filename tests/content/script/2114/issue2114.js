function runTest()
{
    FBTest.sysout("issue2114.START");

    FBTest.openNewTab(basePath + "script/2114/issue2114.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("script");

        FBTest.enableScriptPanel(function(win)
        {
            // Set a breakpoint
            var lineNo = 32;
            FBTest.setBreakpoint(null, null, lineNo, null, function(row)
            {
                FBTest.compare("true", row.getAttribute("breakpoint"), "Line "+lineNo+
                    " should have a breakpoint set");

                // Asynchronously wait for break in debugger.
                var chrome = FW.Firebug.chrome;
                FBTest.waitForBreakInDebugger(chrome, lineNo, true, function(row)
                {
                    FBTest.clickToolbarButton(chrome, "fbStepOverButton");

                    setTimeout(function() {
                        var stopped = chrome.getGlobalAttribute("fbDebuggerButtons", "stopped");
                        FBTest.compare("true", stopped, "The debugger must be stopped by now");
                        FBTest.clickContinueButton(chrome);
                        FBTest.testDone("issue2114.DONE");
                    }, 200);
                });

                FBTest.reload();
            });
        });
    });
}
