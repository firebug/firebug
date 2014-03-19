function runTest()
{
    FBTest.openNewTab(basePath + "script/stepping/1179/issue1179-2.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(createBreakpoint, 11);
            tasks.push(refreshPage, win);
            tasks.push(step, "fbStepOverButton");
            tasks.push(refreshPage, win);

            tasks.run(function()
            {
                FBTest.clickContinueButton();
                FBTest.testDone();
            });
        });
    });
}

function createBreakpoint(callback, lineNo)
{
    FBTest.setBreakpoint(null, basePath + "script/stepping/1179/issue1179-2.html",
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

function step(callback, buttonId)
{
    FBTest.waitForDebuggerResume(function()
    {
        callback();
    });

    FBTest.clickToolbarButton(null, buttonId);
}
