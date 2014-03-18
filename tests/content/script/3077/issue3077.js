function runTest()
{
    FBTest.openNewTab(basePath + "script/3077/issue3077.html", function()
    {
        FBTest.enableScriptPanel(function callbackOnReload(win)
        {
            // Steps:
            // 1. Click on the 'Execute Test' button and break at line 12.
            // 2. Click 'Step Into' and move to line 13.
            // 3. Click 'Step Into' and move to line 14.
            // 4. Click 'Continue' to resume debugger and bail out.
            var tasks = new FBTest.TaskList();
            tasks.push(executeTest, win, 12);
            tasks.push(stepInto, 13);
            tasks.push(stepInto, 14);

            tasks.run(function()
            {
                // Resume debugger and finish the test.
                FBTest.clickContinueButton();
                FBTest.testDone();
            });
        });
    });
}

function executeTest(callback, win, lineNo)
{
    FBTest.waitForBreakInDebugger(null, lineNo, false, function()
    {
        FBTest.progress("break at line: " + lineNo);
        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}

function stepInto(callback, lineNo)
{
    FBTest.waitForBreakInDebugger(null, lineNo, false, function()
    {
        FBTest.progress("stepInto at line: " + lineNo);
        callback();
    });

    FBTest.clickToolbarButton(null, "fbStepIntoButton");
}
