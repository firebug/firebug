function runTest()
{
    FBTest.openNewTab(basePath + "cookies/general/cookiesPanel.html", function(win)
    {
        FBTest.openFirebug(true);
        FBTest.enableCookiesPanel(function(win)
        {
            // Make sure the Cookie panel's UI is there.
            var panel = FBTest.selectPanel("cookies");
            if (panel)
                FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");

            // Finish test
            FBTest.testDone();
        });
    });
};
