function runTest()
{
    FBTest.openNewTab(basePath + "script/stepping/1179/issue1179.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(createBreakpoint, 14);
            tasks.push(createBreakpoint, 21);
            tasks.push(clickTestButton, win);
            tasks.push(step, "fbStepIntoButton", 21, true);
            tasks.push(step, "fbStepOutButton", 14, true);
            tasks.push(step, "fbStepIntoButton", 15, false);
            tasks.push(step, "fbStepOverButton", 16, false);

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
    var baseUrl = basePath + "script/stepping/1179/";
    FBTest.setBreakpoint(null, baseUrl + "issue1179.html", lineNo, null, callback);
}

function clickTestButton(callback, win)
{
    FBTest.waitForBreakInDebugger(null, 14, true, function()
    {
        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}

function step(callback, buttonId, lineNo, breakpoint)
{
    FBTest.waitForBreakInDebugger(null, lineNo, breakpoint, function()
    {
        callback();
    });

    FBTest.clickToolbarButton(null, buttonId);
}
