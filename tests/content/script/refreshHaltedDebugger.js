function runTest()
{
    // 1) Open test page
    FBTest.openNewTab(basePath + "script/refreshHaltedDebugger.html", function(win)
    {
        // 2) Open Firebug and enable the Script panel.
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                FBTest.selectPanel("script");

                // Wait for break in debugger.
                var chrome = FW.Firebug.chrome;
                FBTest.waitForBreakInDebugger(chrome, 26, false, function(sourceRow)
                {
                    FBTest.progress("refreshHaltedDebugger; Halted on debugger keyword I.");

                    // Wait for another break.
                    FBTest.waitForBreakInDebugger(chrome, 26, false, function(sourceRow)
                    {
                        FBTest.progress("refreshHaltedDebugger; Halted on debugger keyword II.");
                        FBTest.clickContinueButton(chrome);
                        FBTest.testDone();
                    });

                    // If the debugger is resumed before refresh, the test passes.
                    //FBTest.clickContinueButton(chrome);

                    // 4) Reload page and wait for another break.
                    FBTest.reload(function(win)
                    {
                        executeTest(win);
                    });
                });

                // 3) Execute test on the page.
                executeTest(win);
            });
        });
    });
}

function executeTest(win)
{
    FBTest.progress("refreshHaltedDebugger; Execute Test.");

    setTimeout(function()
    {
        FBTest.click(win.document.getElementById("testButton"));
    }, 10);
}
