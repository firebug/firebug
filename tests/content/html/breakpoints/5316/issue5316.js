function runTest()
{
    FBTest.openNewTab(basePath + "html/breakpoints/5316/issue5316.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                var chrome = FW.Firebug.chrome;
                var content = win.document.getElementById("content");
                var context = chrome.window.Firebug.currentContext;
                var BP_BREAKONATTRCHANGE = 1;

                // Set breakpoint.
                FBTest.selectPanel("html");
                FW.Firebug.HTMLModule.MutationBreakpoints.onModifyBreakpoint(context,
                    content, BP_BREAKONATTRCHANGE);

                // Select the Script panel and cause Firebug to break.
                FBTest.selectPanel("script");
                breakOnMutation(win, function()
                {
                    // Reload and cause break again.
                    FBTest.reload(function(win)
                    {
                        breakOnMutation(win, function()
                        {
                            FBTest.testDone();
                        });
                    });
                });
            });
        });
    });
}

function breakOnMutation(win, callback)
{
    var chrome = FW.Firebug.chrome;
    FBTest.waitForBreakInDebugger(chrome, 20, false, function(sourceRow)
    {
        FBTest.sysout("issue5136; before continue");
        FBTest.clickContinueButton(chrome);
        FBTest.progress("The continue button is pushed");
        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
    FBTest.sysout("button clicked");
}
