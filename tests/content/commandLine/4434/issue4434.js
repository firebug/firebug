function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4434/issue4434.html", function(win)
    {
        FBTest.enablePanels(["script", "console"], function() {
            var tasks = new FBTest.TaskList();
            tasks.push(waitForBreak, win, 21);
            tasks.push(testAutocompletion, "myVar", "myVar1", win);
            tasks.push(testAutocompletion, "myGlobal", "myGlobal1", win);
            tasks.push(testAutocompletion, "myParam", "myParam1", win);
            tasks.push(waitForResume);

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

    FBTest.click(win.document.getElementById("testButton"));
}

function waitForResume(callback)
{
    FBTest.waitForDebuggerResume(function()
    {
        callback();
    });

    FBTest.clickToolbarButton(null, "fbContinueButton");
}

function testAutocompletion(callback, expr, expected, win)
{
    var doc = FW.Firebug.chrome.window.document;
    var cmdLine = doc.getElementById("fbCommandLine");

    FBTest.selectPanel("console");

    // Make sure the console is focused and command line API loaded.
    FBTest.focus(cmdLine);
    FBTest.clearCommand();

    FBTest.typeCommand(expr);
    FBTest.synthesizeKey("VK_TAB", null, win);
    FBTest.compare(expected, cmdLine.value, "The command line must display '" + expected +
        "' after tab key completion.");

    callback();
}
