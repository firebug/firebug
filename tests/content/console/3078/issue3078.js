function runTest()
{
    FBTest.openNewTab(basePath + "console/3078/issue3078.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanelAndReload(function()
            {
                var panel = FBTest.getSelectedPanel();

                // Ensure that the console starts scrolled to bottom.
                panel.clear();

                // Wait that the last log appears.
                // This ensures that at least one message has been logged and that the scrollbar
                // has appeared.
                FBTest.waitForDisplayedText("console", "299", function()
                {
                    var scrolled = FW.FBL.isScrolledToBottom(panel.panelNode);
                    if (!scrolled)
                    {
                        FBTest.progress("isScrolledToBottom offsetHeight: " +
                            panel.panelNode.offsetHeight + ", scrollTop: " +
                            panel.panelNode.scrollTop + ", scrollHeight: " +
                            panel.panelNode.scrollHeight);
                    }

                    FBTest.ok(scrolled, "Panel must be scrolled to the bottom");
                    FBTest.testDone();
                });
            });
        });
    });
}
