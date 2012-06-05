function runTest()
{
    FBTest.sysout("cookies.test.cookiePanel.START ");

    FBTestFirebug.openNewTab(basePath + "general/cookiePanel.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.cookiePanel; Check existence of the Cookies panel.");

            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug(true);
            var panel = FBTestFirebug.selectPanel("cookies");

            FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");

            // Finish test
            FBTestFirebug.testDone("cookies.test.cookiePanel.DONE");
        });
    });
};
