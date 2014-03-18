function runTest()
{
    FBTest.openNewTab(basePath + "console/3078/issue3078.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                var panel = FBTest.getSelectedPanel();

                // ensure that the console starts scrolled to bottom
                panel.clear();

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
}
