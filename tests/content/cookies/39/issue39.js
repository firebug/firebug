function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/39/issue39.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            var cookie = FBTest.getCookieByName(panelNode, "TestCookie39");
            FBTest.ok(cookie, "The cookie must exist");

            // Open Modal edit cookie dialog.
            FBTest.editCookie(cookie, function(dialog) {
                dialog.EditCookie.onOK();
            });

            // Now verify that the cookie value is still the same.
            cookie = FBTest.getCookieByName(panelNode, "TestCookie39");
            FBTest.compare("CookieValue;39", cookie ? cookie.cookie.value : "",
                "Cookie value must be correct.");

            FBTest.testDone();
        });
    });
};
