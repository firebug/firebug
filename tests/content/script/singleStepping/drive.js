function runTest()
{
    FBTest.openNewTab(basePath + "script/singleStepping/index.html", function()
    {
        FBTest.enableScriptPanel(function(win)
        {
            var tasks = new FBTest.TaskList();

            // Break in inline event handler
            tasks.push(breakOnNext, 1, "onclick", win);

            // Step into the page
            tasks.push(step, FBTest.stepInto, 14, "index.html");

            // Step over within the page
            tasks.push(step, FBTest.stepOver, 15, "index.html");

            // One more step over at the end of the function (shows result value)
            tasks.push(step, FBTest.stepOver, 15, "index.html");

            // Step out back to the event handler.
            tasks.push(step, FBTest.stepOut, 1, "onclick");

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function breakOnNext(callback, targetLine, fileName, win)
{
    var chrome = FW.Firebug.chrome;

    FBTest.clickBreakOnNextButton(chrome, function()
    {
        FBTest.waitForBreakInDebugger(chrome, targetLine, false, function(row)
        {
            var label = FBTest.getCurrentLocation();
            FBTest.ok(label.indexOf(fileName) != -1, "The location must be expected: " + fileName);
            callback();
        });

        FBTest.click(win.document.getElementById("clicker"));
    });
}

function step(callback, stepFunction, targetLine, fileName)
{
    var chrome = FW.Firebug.chrome;

    stepFunction(targetLine, function()
    {
        var label = FBTest.getCurrentLocation();
        FBTest.ok(label.indexOf(fileName) != -1, "The location must be expected: " + fileName);
        callback();
    });
}
