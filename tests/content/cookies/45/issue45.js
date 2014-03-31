function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/45/issue45.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            var cookie = FBTest.getCookieByName(panelNode, "TestCookie45");

            // Open Modal edit cookie dialog.
            FBTest.editCookie(cookie, function(dialog) {
                dialog.EditCookie.onOK();
            });

            // Verify the the following cookie doesn't exist. The cookie name must
            // not be escaped.
            cookie = FBTest.getCookieByName(panelNode, "TestCookie45");
            FBTest.compare("aaa+bbb", cookie ? cookie.cookie.value : "",
                "Cookie value must be still the same");

            FBTest.testDone();
        });
    });
};
