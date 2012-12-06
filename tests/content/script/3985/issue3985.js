function runTest()
{
    FBTest.sysout("issue3985.START");

    FBTest.openNewTab(basePath + "script/3985/issue3985.html", function(win)
    {
        // Enable the Script panel
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.progress("Wait till the iframe is loaded");

            // Wait till the iframe is loaded.
            var config = {tagName: "span", classes: "sourceRowText"};

            var panelNode = FBTest.getPanel("script").panelNode;
            var nodes = panelNode.getElementsByClassName(config.classes);
            FBTest.progress("Nodes: " + nodes.length);

            FBTest.waitForDisplayedElement("script", config, function(row)
            {
                FBTest.progress("Set breakpoint");

                // Set a breakpoint
                FBTest.setBreakpoint(null, "issue3985-frame.js", 3, null, function()
                {
                    FBTest.progress("Reload");

                    // Reload
                    FBTest.reload(function()
                    {
                        // Wait for breakpoint hit.
                        FBTest.waitForBreakInDebugger(null, 3, true, function(row)
                        {
                            FBTest.progress("Click continue button");

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