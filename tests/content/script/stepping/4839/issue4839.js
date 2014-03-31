function runTest()
{
    FBTest.openNewTab(basePath + "script/stepping/4839/issue4839.html", function(win)
    {
        FBTest.enablePanels(["script"], function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(createBreakpoint, 11);
            tasks.push(refreshPage, win);
            tasks.push(step, "fbStepOverButton", 12, false);
            tasks.push(step, "fbStepOverButton", 0, false);
            tasks.push(refreshPage, win);
            tasks.push(step, "fbContinueButton", 0, false);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function createBreakpoint(callback, lineNo)
{
    FBTest.setBreakpoint(null, basePath + "script/stepping/4839/issue4839.html",
        lineNo, null, callback);
}

function refreshPage(callback, win)
{
    FBTest.waitForBreakInDebugger(null, 11, true, function()
    {
        callback();
    });

    FBTest.reload()
}

function step(callback, buttonId, lineNo, breakpoint)
{
    if (lineNo > 0)
    {
        FBTest.waitForBreakInDebugger(null, lineNo, breakpoint, function()
        {
            callback();
        });
    }
    else
    {
        FBTest.waitForDebuggerResume(function()
        {
            callback();
        });
    }

    FBTest.clickToolbarButton(null, buttonId);
}
