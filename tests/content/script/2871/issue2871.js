function runTest()
{
    var lineNo = 16;
    var fileName = basePath + "script/2871/issue2871.html";

    FBTest.openNewTab(fileName, function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            // Create a new breakpoint
            FBTest.setBreakpoint(null, fileName, lineNo, null, function()
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
                    var expected = /MyObj\s*{\s*ttt=\"asd\"\s*/;
                    FBTest.compare(expected, valueCol.textContent,
                        "Verify the result value");

                    FBTest.testDone();
                })
            })
        });
    });
}
