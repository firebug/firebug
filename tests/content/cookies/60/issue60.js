function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/60/issue60.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            var cookie = FBTest.getCookieByName(panelNode, "TestCookie60[user]");

            // Open Modal edit cookie dialog.
            FBTest.editCookie(cookie, function(dialog) {
                dialog.EditCookie.onOK();
            });

            // Verify the the following cookie doesn't exist. The cookie name must
            // not be escaped.
            var cookie = FBTest.getCookieByName(panelNode, "TestCookie60%5Buser%5D");
            FBTest.ok(cookie == null, "Cookie name must not be escaped");

            FBTest.testDone();
        });
    });
};
