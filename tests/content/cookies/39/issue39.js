function runTest()
{
    FBTest.sysout("cookies.test.issue39; START");

    FBTestFirebug.openNewTab(basePath + "cookies/39/issue39.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            var cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie39");
            FBTest.ok(cookie, "The cookie must exist");

            // Open Modal edit cookie dialog.
            FBTestFireCookie.editCookie(cookie, function(dialog) {
                dialog.EditCookie.onOK();
            });

            // Now verify that the cookie value is still the same.
            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie39");
            FBTest.compare("CookieValue;39", cookie ? cookie.cookie.value : "",
                "Cookie value must be correct.");

            FBTestFirebug.testDone("cookies.test.issue39; DONE");
        });
    });
};
