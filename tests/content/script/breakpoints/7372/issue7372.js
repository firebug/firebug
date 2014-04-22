function runTest()
{
    var url = basePath + "script/breakpoints/7372/issue7372.html";
    FBTest.openNewTab(url, (win) =>
    {
        FBTest.enablePanels(["script", "console"], (win) =>
        {
            // xxxHonza: it would be better if the test could execute
            // commands in the Command Line Popup (on the Script panel),
            // but FBTest API are missing for that.

            var tasks = new FBTest.TaskList();

            tasks.push(FBTest.executeCommandAndVerify, "debug(executeTest)",
                "Breakpoint created.", "div", "logRow logRow-info");

            tasks.push(FBTest.executeCommandAndVerify, "monitor(executeTest)",
                "Monitor created.", "div", "logRow logRow-info");

            tasks.push(FBTest.executeCommandAndVerify, "unmonitor(executeTest)",
                "Monitor removed.", "div", "logRow logRow-info");

            // Verify the Script panel, the breakpoint must be there.
            tasks.push((callback) =>
            {
                FBTest.selectPanel("script");
                FBTest.selectSourceLine(url, 16, "js", null, () =>
                {
                    var has = FBTest.hasBreakpoint(16);
                    FBTest.ok(has, "There must be a breakpoint at line 16");
                    callback();
                })
            });

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}
