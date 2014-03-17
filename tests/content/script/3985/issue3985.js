function runTest()
{
    FBTest.openNewTab(basePath + "script/3985/issue3985.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.progress("Wait till the iframe is loaded");

            var url = basePath + "script/3985/issue3985-iframe.js";
            FBTest.setBreakpoint(null, url, 3, null, function()
            {
                FBTest.progress("Reload");

                FBTest.reload(function()
                {
                    // Wait for breakpoint hit.
                    FBTest.waitForBreakInDebugger(null, 3, true, function(row)
                    {
                        FBTest.progress("Click continue button");

                        FBTest.clickContinueButton();
                        FBTest.testDone();
                    });

                    FBTest.waitForDisplayedBreakpoint(null, url, 3, function(row)
                    {
                        // Click a button.
                        var frame = win.document.getElementById("testFrame");
                        FBTest.click(frame.contentDocument.getElementById("trigger"));
                    });
                });
            });
        });
    });
}