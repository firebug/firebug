function runTest()
{
    FBTest.openNewTab(basePath + "script/stepping/StepIntoInIFrame/test.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(waitForBreak, win, 6);
            tasks.push(step, "fbStepOverButton", 7, false);
            tasks.push(step, "fbStepIntoButton", 15, false);
            tasks.push(step, "fbContinueButton", 0, false);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function waitForBreak(callback, win, lineNo)
{
    FBTest.waitForBreakInDebugger(null, lineNo, false, function()
    {
        callback();
    });

    var frame = win.document.getElementById("testFrame");
    FBTest.click(frame.contentDocument.getElementById("testButton"));
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
