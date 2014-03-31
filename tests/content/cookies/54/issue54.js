function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/54/issue54.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            var cookie = FBTest.getCookieByName(panelNode, "TestCookie54");

            // Open Modal edit cookie dialog.
            FBTest.editCookie(cookie, function(dialog) {
                dialog.EditCookie.onOK();
            });

            // Verify JSON tab content
            FBTest.verifyInfoTabContent(panelNode, "TestCookie54", "Value", "-!-");
            FBTest.verifyInfoTabContent(panelNode, "TestCookie54", "RawValue", "-%21-");

            FBTest.testDone();
        });
    });
};
