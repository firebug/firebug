function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/6253/issue6253.html", (win) =>
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, "issue6253.html", 9, null, (row) =>
            {
                // In first try, It's likely pass the test if there is no problem,
                // but test the chance a second time if test fails to make sure
                // the reason causes failing is something else than a haste.
                var Number_Of_Attempts = 2;

                tryTest(Number_Of_Attempts);

                function tryTest(numberOfAttempts)
                {
                    setTimeout(() =>
                    {
                        var breakpointLeftLineNine = !FBTest.hasBreakpoint(9);

                        // Interested in trying again, if the breakpoint hasn't
                        // left line #9 yet?
                        if (!breakpointLeftLineNine && --numberOfAttempts)
                        {
                            // Try again with a delay of 30 millisecond.
                            setTimeout(arguments.callee, 30);
                            FBTest.progress("Waiting for the breakpoint to find " +
                                "the right location");
                            return;
                        }

                        FBTest.ok(breakpointLeftLineNine,
                            "Breakpoint must not be set at line 9 anymore");

                        var breakpointHasMoved = FBTest.hasBreakpoint(11);

                        FBTest.ok(breakpointHasMoved,
                            "Breakpoint must be set at line 11 now");

                        // Go to breakpoints side panel.
                        FBTest.selectPanel("script");
                        var breakpointsPanel = FBTest.selectSidePanel("breakpoints");

                        // Make sure the breakpoint is displayed in breakpoint side panel
                        var breakpointRow = breakpointsPanel.panelNode.
                            getElementsByClassName("breakpointRow");
                        FBTest.compare(breakpointRow.length, 1, "There must be " +
                            "a breakpoint row in the Breakpoints side panel");

                        // Realod the page and wait for the script execution to
                        // halt on the breakpoint at line 11.
                        FBTest.waitForBreakInDebugger(null, 11, true, () =>
                        {
                            FBTest.progress("Breakpoint gets hint at line 11");
                            FBTest.clickContinueButton();
                            FBTest.testDone();
                        });
                        FBTest.reload();
                    });
                }
            });
        });
    });
}
