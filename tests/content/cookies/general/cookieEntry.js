function runTest()
{
    FBTest.sysout("cookies.test.cookieEntry; START");
    var browser = FBTest.FirebugWindow;

    FBTestFirebug.openNewTab(basePath + "cookies/general/cookieEntry.php", function(win)
    {
        FBTest.sysout("cookies.test.cookieEntry; Check cookie entry in the Cookies panel");

        // Open Firebug UI and enable Net panel.
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug(true);
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            var cookieRow = FBTestFireCookie.getCookieRowByName(panelNode, "TestCookieEntry");
            if (FBTest.ok(cookieRow, "There must be a row for TestCookieEntry cookie."))
            {
                FBTest.click(cookieRow);
                var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow");
                FBTest.ok(cookieInfo.length > 0, "There must be an info-body displayed");
            }

            // Finish test
            FBTestFirebug.testDone("cookies.test.cookieEntry; DONE");
        });
    });
};
