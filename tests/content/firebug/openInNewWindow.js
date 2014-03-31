var fileName = "index.js";
var lineNo = 5;
var testPageURL = basePath + "script/1483/issue1483.html";
var detachedWindow;

function runTest()
{
    FBTest.openNewTab(testPageURL, function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                var tasks = new FBTest.TaskList();
                tasks.push(waitForDetachedFirebug);
                tasks.push(setBreakpointReloadAndWaitForBreak);
                tasks.push(reloadAgainAndWaitForBreak);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
};

function waitForDetachedFirebug(callback)
{
    FBTest.detachFirebug(function(detachedWindow)
    {
        if (!FBTest.ok(detachedWindow, "Firebug is detaching..."))
        {
            FBTest.testDone();
            return;
        }

        FBTest.OneShotHandler(detachedWindow, "load", function(event)
        {
            FBTest.progress("Firebug detached in a new window.");
            callback();
        });
    });
}

function setBreakpointReloadAndWaitForBreak(callback)
{
    FBTest.waitForBreakInDebugger(null, lineNo, false, function()
    {
        FBTest.progress("The first break happened");
        callback();
    });

    FBTest.setBreakpoint(null, fileName, lineNo, null, function()
    {
        FBTest.reload();
    });
}

function reloadAgainAndWaitForBreak(callback)
{
    var hit = false;
    FBTest.waitForBreakInDebugger(null, lineNo, true, function()
    {
        hit = true;
        FBTest.progress("The second break on the breakpoint.");

        // xxxHonza: This timeout is puzzling me, but if it isn't there
        // the debugger is not resumed even if the Debugger.resume is
        // properly called.
        setTimeout(function()
        {
            FBTest.clickContinueButton();
        }, 500);
    });

    FBTest.reload(function()
    {
        FBTest.ok(hit, "The second break happened");
        FBTest.closeDetachedFirebug();
        callback();
    });
}
