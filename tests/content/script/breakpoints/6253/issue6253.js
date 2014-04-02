function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/6253/issue6253.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, "issue6253.html", 9, null, function(row)
            {
                // In first try, It's likely pass the test if there is no problem,
                // but test the chance a second time if test fails to make sure
                // the reason causes failing is something else than a haste.
                var Number_Of_Attempts = 2;

                tryTest(Number_Of_Attempts);

                function tryTest(numberOfAttempts)
                {
                    setTimeout(function ()
                    {
                        var breakpointLeftLineNine = !FBTest.hasBreakpoint(9);

                        // Interested in trying again, if the breakpoint hasn't
                        // left line #9 yet?
                        if (!breakpointLeftLineNine && --numberOfAttempts)
                        {
                            // Try again with a delay of 30 millisecond.
                            setTimeout(arguments.callee, 30);
                            FBTest.progress("Waiting yet for the breakpoint to finds " +
                                "the right sit .....");
                            return;
                        }

                        FBTest.ok(breakpointLeftLineNine,
                            "Then, The bp must have left line 9");

                        var breakpointHasMoved = FBTest.hasBreakpoint(11);

                        FBTest.ok(breakpointHasMoved,
                            "Then, The bp must have moved to line 11");

                        FBTest.testDone();
                    }, 0);
                }
            });
        });
    });
}
