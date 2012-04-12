function runTest()
{
    FBTest.sysout("breakOnError.START");
    FBTest.openNewTab(basePath + "console/breakOnError/breakOnError.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel()
        FBTest.enableConsolePanel(function(win)
        {
            var panel = FBTest.selectPanel("console");

            FBTest.waitForBreakInDebugger(null, 27, false, function(row)
            {
                // Resume debugger.
                FBTest.clickContinueButton();

                // 5) Finish test.
                FBTest.testDone("breakOnNext.DONE");
            });

            FBTest.clickBreakOnNextButton();
            FBTest.progress("activated break on next");
            var testButton = win.document.getElementById("testButton");
            testButton.addEventListener('click', function verifyClick()
            {
                FBTest.progress("testButton was clicked");
                testButton.removeEventListener('click', verifyClick, true);
            }, true);

            FBTest.progress("now click the testButton");
            FBTest.click(testButton);
        });
    });
}
