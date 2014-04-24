function runTest()
{
    FBTest.openNewTab(basePath + "console/breakOnError/breakOnError2.html", function()
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(createErrorBreakpoint, win);
            tasks.push(breakOnError, win);
            tasks.run(FBTest.testDone);
        });
    });
}

function createErrorBreakpoint(callback, win)
{
    var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
    FBTest.waitForDisplayedElement("console", config, (log) =>
    {
        var breakpoint = log.getElementsByClassName("errorBreak").item(0);
        FBTest.click(breakpoint);
        callback();
    });

    FBTest.clickContentButton(win, "testButton");
}

function breakOnError(callback, win)
{
    FBTest.waitForBreakInDebugger(null, 1, false, callback);
    FBTest.clickContentButton(win, "testButton");
}
