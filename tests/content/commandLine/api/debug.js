function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/debug.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function()
        {
            var tasks = new FBTest.TaskList();

            // Create breakpoint using 'debug(onTextExecute)' method on the cmd line.
            tasks.push(createBreakpoint);

            // Execute breakpoint by pressing 'Execute Test' button on the page.
            tasks.push(executeBreakpoint, win);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function createBreakpoint(callback)
{
    // Asynchronously wait for result in the Console panel.
    var config = {tagName: "div", classes: "logRow logRow-command"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare("debug(onExecuteTest)", row.textContent,
            "The command line should display: debug(onExecuteTest)");
        callback();
    });

    // Execute command line expression.
    FBTest.executeCommand("debug(onExecuteTest)");
}

function executeBreakpoint(callback, win)
{
    // Asynchronously wait for break in debugger.
    FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 30, false, function(row)
    {
        FBTest.clickContinueButton();
        callback();
    });

    // Execute test by clicking on the 'Execute Test' button.
    FBTest.clickContentButton(win, "testButton");
}
