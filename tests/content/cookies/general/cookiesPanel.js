function runTest()
{
    FBTest.sysout("cookiesPanel.START");

    FBTest.openNewTab(basePath + "cookies/general/cookiesPanel.html", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookiesPanel; Check existence of the Cookies panel.");

            // Make sure the Cookie panel's UI is there.
            FBTest.openFirebug(true);
            var panel = FBTest.selectPanel("cookies");

            FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");

            // Finish test
            FBTest.testDone("cookiesPanel.DONE");
        });
    });
};
