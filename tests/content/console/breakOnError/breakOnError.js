function runTest()
{
    FBTest.openNewTab(basePath + "console/breakOnError/breakOnError.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function()
        {
            FBTest.waitForBreakInDebugger(null, 28, false, function(row)
            {
                // Resume debugger.
                FBTest.clickContinueButton();

                // 5) Finish test.
                FBTest.testDone();
            });

            FBTest.progress("activated break on next");

            FBTest.clickBreakOnNextButton(null, function()
            {
                var testButton = win.document.getElementById("testButton");
                testButton.addEventListener("click", function verifyClick()
                {
                    FBTest.progress("testButton was clicked");
                    testButton.removeEventListener("click", verifyClick, true);
                }, true);

                FBTest.progress("now click the testButton");
                FBTest.click(testButton);
            });
        });
    });
}
