function runTest()
{
    FBTest.sysout("issue3985.START");

    FBTest.openNewTab(basePath + "script/3985/issue3985.html", function(win)
    {
        // Enable the Script panel
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            // Wait till the iframe is loaded.
            var config = {tagName: "span", classes: "sourceRowText"};
            FBTest.waitForDisplayedElement("script", config, function(row)
            {
                // Set a breakpoint
                FBTest.setBreakpoint(null, "issue3985-frame.js", 3, null, function()
                {
                    // Reload
                    FBTest.reload(function()
                    {
                        // Wait for breakpoint hit.
                        FBTest.waitForBreakInDebugger(null, 3, true, function(row)
                        {
                            FBTest.clickContinueButton();
                            FBTest.testDone("issue3985.DONE");
                        });

                        // Click a button.
                        var frame = win.document.getElementById("testFrame");
                        FBTest.click(frame.contentDocument.getElementById("trigger"));
                    });
                });
            });
        });
    });
}