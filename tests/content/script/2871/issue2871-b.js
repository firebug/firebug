function runTest()
{
    if (FBTest.compareFirefoxVersion("3.6.*") <= 0)
    {
        FBTest.progress("This test is only for Firefox 4.0+");
        FBTest.testDone("issue2871-b.DONE");
        return;
    }

    var lineNo = 15;

    FBTest.sysout("issue2871-b.START");
    FBTest.openNewTab(basePath + "script/2871/issue2871-b.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel(function(win)
        {
            // Create a new breakpoint
            FBTest.setBreakpoint(null, "issue2871-b.html", lineNo, null, function()
            {
                FBTest.progress("Breakpoint is ready");
            });

            // Wait for break in the debugger (the breakpoint hits automatically)
            FBTest.waitForBreakInDebugger(null, lineNo, true, function()
            {
                FBTest.progress("Breakpoint happened");

                // Create a new watch expression and verify the result.
                FBTest.addWatchExpression(null, "_this", function(valueCol)
                {
                    var expected = /Object\s*{\s*ttt=\"asd\"\s*}/;
                    FBTest.compare(expected, valueCol.textContent,
                        "Verify the result value");

                    FBTest.testDone("issue2871-b.DONE");
                })
            })
        });
    });
}
