function runTest()
{
    FBTest.sysout("issue3078.START");
    FBTest.openNewTab(basePath + "console/3078/issue3078.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableAllPanels();

        var panel = FW.Firebug.chrome.selectPanel("console");
        panel.clear();  // ensure that the console starts scrolled to bottom

        FBTest.enableConsolePanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("console");
            FBTest.ok(panel && (panel.name === "console"), "The console panel must be selected");

            var scrolled = FW.FBL.isScrolledToBottom(panel.panelNode);
            if (!scrolled)
                FBTest.progress("isScrolledToBottom offsetHeight: " + panel.panelNode.offsetHeight +
                        ", scrollTop: " + panel.panelNode.scrollTop + ", scrollHeight: " + panel.panelNode.scrollHeight);

            FBTest.ok(scrolled, "The panel must be scrolled at the bottom.");
            FBTest.testDone("issue3078.DONE");
        });
    });
}
