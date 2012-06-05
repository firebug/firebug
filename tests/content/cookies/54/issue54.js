function runTest()
{
    FBTest.sysout("cookies.test.issue54; START");

    FBTestFirebug.openNewTab(basePath + "cookies/54/issue54.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            var cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie54");

            // Open Modal edit cookie dialog.
            FBTestFireCookie.editCookie(cookie, function(dialog) {
                dialog.EditCookie.onOK();
            });

            // Verify JSON tab content
            FBTestFireCookie.verifyInfoTabContent(panelNode, "TestCookie54", "Value", "-!-");
            FBTestFireCookie.verifyInfoTabContent(panelNode, "TestCookie54", "RawValue", "-%21-");

            FBTestFirebug.testDone("cookies.test.issue54; DONE");
        });
    });
};
