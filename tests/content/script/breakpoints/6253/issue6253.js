function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/6253/issue6253.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, "issue6253.html", 10, null, function(row)
            {
                // Little wait to the breakpoint finds the right sit(line 12).
                function delay(func)
                {
                    setTimeout(func());
                }

                delay(function ()
                {
                    var breakpointLeftLineTen = !FBTest.hasBreakpoint(10);
                    FBTest.ok(breakpointLeftLineTen,
                        "At this time, There must not be a bp at line 10");

                    var breakpointHasMoved = breakpointLeftLineTen &&
                        FBTest.hasBreakpoint(12);
                    FBTest.ok(breakpointHasMoved,
                        "Then, The bp must have moved to line 12");

                    FBTest.testDone();
                });
            });
        });
    });
}
