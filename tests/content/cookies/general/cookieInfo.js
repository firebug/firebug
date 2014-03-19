function runTest()
{
    var bcookieRowser = FBTest.FirebugWindow;

    FBTest.openNewTab(basePath + "cookies/general/cookieInfo.php", function(win)
    {
        FBTest.sysout("cookieInfo; Check cookie entry in the Cookies panel");

        var target = FW.Firebug.chrome.window.top.document.documentElement;
        FBTest.pressToggleFirebug(true, target);
        //FBTest.openFirebug(true);

        // Open Firebug UI and enable Net panel.
        FBTest.enableCookiesPanel(function(win)
        {
            // Make sure the Cookie panel's UI is there.
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            var cookieRow = FBTest.getCookieRowByName(panelNode, "TestCookieInfo");
            if (FBTest.ok(cookieRow, "There must be a cookieRow for the 'TestcookieInfo' cookie."))
            {
                // Check displayed values.
                var name = cookieRow.getElementsByClassName("cookieNameLabel").item(0);
                FBTest.compare("TestCookieInfo", name.textContent, "Name of the cookie validation");

                var value = cookieRow.getElementsByClassName("cookieValueLabel").item(0);
                FBTest.compare("Test Cookie Value", value.textContent, "Value of the cookie validation");

                var uri = FW.FBL.makeURI(basePath);
                var expectedDomain = uri.host;
                var domain = cookieRow.getElementsByClassName("cookieDomainLabel").item(0);

                // Add a dot to the domain name in case of a public domain like 'getfirebug.com'
                if (domain.textContent != uri.host && uri.host.indexOf(".") != -1)
                    expectedDomain = "." + expectedDomain;

                FBTest.compare(expectedDomain, domain.textContent, "Domain of the cookie validation");

                var size = cookieRow.getElementsByClassName("cookieSizeLabel").item(0);
                FBTest.compare("31 B", size.textContent, "Size of the cookie validation");

                var path = cookieRow.getElementsByClassName("cookiePathLabel").item(0);
                FBTest.compare("/", path.textContent, "Path of the cookie validation");

                var path = cookieRow.getElementsByClassName("cookieExpiresLabel").item(0);

                FBTest.compare(
                    FW.Firebug.CookieModule.CookieReps.CookieRow.getExpires(cookieRow.repObject),
                    path.textContent, "Expire date of the cookie validation (localized)");

                var httpOnly = cookieRow.getElementsByClassName("cookieHttpOnlyLabel").item(0);
                FBTest.compare("HttpOnly", httpOnly.textContent, "HttpOnly flag validation");

                var secure = cookieRow.getElementsByClassName("cookieSecurityLabel").item(0);
                FBTest.compare(FW.FBL.$STR("cookies.secure.label"), secure.textContent, "Secure flag validation");

                var config = {tagName: "tr", classes: "cookieInfoRow"};
                FBTest.waitForDisplayedElement("cookies", config, function (infoRow)
                {
                    var infoValue = panelNode.getElementsByClassName("cookieInfoValueText").item(0);
                    FBTest.compare("Test Cookie Value", infoValue.textContent, "Value of the cookie (in the body) validation");

                    // Finish test
                    FBTest.testDone();
                });

                FBTest.click(cookieRow);
            }
        });
    });
};
