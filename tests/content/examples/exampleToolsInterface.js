function runTest()
{
    // 1) Load test case page
    FBTest.openNewTab(basePath + "examples/exampleToolsInterface.html", function(win)
    {
        // 2) Open Firebug and enable the Script panel.
        FBTest.enableScriptPanel(function(win)
        {
            // 3) Select the Script panel
            var panel = FW.Firebug.chrome.selectPanel("script");
            var browser = new FW.Firebug.BTI.Browser();
            FBTest.ok(browser, "We created a browser");

            FBTest.sysout("Browser ", browser);

            // Asynchronously wait for break in debugger.
            var chrome = FW.Firebug.chrome;
            FBTest.waitForBreakInDebugger(chrome, 22, false, function(row)
            {
                // TODO: test code, verify UI, etc.

                // Resume debugger.
                FBTest.clickContinueButton();

                // 5) Finish test.
                FBTest.testDone();
            });

            // 4) Execute test by clicking on the 'Execute Test' button.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
