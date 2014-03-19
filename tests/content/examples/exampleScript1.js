function runTest()
{
    // 1) Load test case page
    FBTest.openNewTab(basePath + "examples/exampleScript1.html", function(win)
    {
        // 2) Open Firebug and enable the Script panel.
        FBTest.openFirebug(function()
        {
            FBTest.sysout("exampleScript1; Firebug opened");

            FBTest.enableScriptPanel(function(win)
            {
                FBTest.sysout("exampleScript1; Script panel enabled ");

                // 3) Select the Script panel
                var panel = FW.Firebug.chrome.selectPanel("script");

                // Asynchronously wait for break in debugger.
                var chrome = FW.Firebug.chrome;
                FBTest.waitForBreakInDebugger(chrome, 22, false, function(row)
                {
                    // TODO: test code, verify UI, etc.

                    // Resume debugger.
                    FBTest.clickContinueButton(null, function()
                    {
                        // 5) Finish test.
                        FBTest.testDone();
                    });
                });

                // 4) Execute test by clicking on the 'Execute Test' button.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
