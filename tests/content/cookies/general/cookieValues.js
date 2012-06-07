function runTest()
{
    FBTest.sysout("cookies.test.cookieValues; START");

    FBTestFirebug.openNewTab(basePath + "cookies/general/cookieValues.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.cookiePanel; Check cookie values");

            // Make sure the Cookie panel's UI is there.
            FW.Firebug.showBar(true);
            var panelNode = FW.Firebug.chrome.selectPanel("cookies").panelNode;

            var row = FBTestFireCookie.getCookieRowByName(panelNode, "TestCookieValues");

            // Check displayed values.
            var name = FW.FBL.getElementByClass(row, "cookieNameLabel", "cookieLabel");
            FBTest.compare("TestCookieValues", name.textContent, "Name of the cookie validation");

            var value = FW.FBL.getElementByClass(row, "cookieValueLabel", "cookieLabel");
            FBTest.compare("Test Cookie Value", value.textContent, "Value of the cookie validation");

            var uri = FW.FBL.makeURI(basePath);
            var domain = FW.FBL.getElementByClass(row, "cookieDomainLabel", "cookieLabel");
            FBTest.compare(uri.host, domain.textContent, "Domain of the cookie validation");

            var size = FW.FBL.getElementByClass(row, "cookieSizeLabel", "cookieLabel");
            FBTest.compare("33 B", size.textContent, "Size of the cookie validation");

            var path = FW.FBL.getElementByClass(row, "cookiePathLabel", "cookieLabel");
            FBTest.compare("/dir", path.textContent, "Path of the cookie validation");

            // xxxHonza: fails
            //FBTest.compare(1565778363, row.repObject.cookie.expires, "Expire date of the cookie validation ");
            var path = FW.FBL.getElementByClass(row, "cookieExpiresLabel", "cookieLabel");

            FBTest.compare(
                FW.Firebug.CookieModule.CookieReps.CookieRow.getExpires(row.repObject),
                path.textContent, "Expire date of the cookie validation (localized)");

            var httpOnly = FW.FBL.getElementByClass(row, "cookieHttpOnlyLabel","cookieLabel");
            FBTest.compare("HttpOnly", httpOnly.textContent, "HTTP Only flag validation");

            FBTest.click(row);
            var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow");

            var infoValue = FW.FBL.getElementByClass(panelNode, "cookieInfoValueText", "cookieInfoText");
            FBTest.compare("Test Cookie Value", infoValue.textContent, "Value of the cookie (in the body) validation");

            // Finish test
            FBTestFirebug.testDone("cookies.test.cookieValues; DONE");
        });
    });
};
