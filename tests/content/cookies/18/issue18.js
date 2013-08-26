function runTest()
{
    FBTest.sysout("cookies.test.issue18; START");

    FBTest.openNewTab(basePath + "cookies/18/issue18.php", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            FBTest.sysout("cookies.test.issue18; Check clipboard functionality");

            // Make sure the Cookie panel's UI is there.
            FBTest.openFirebug();
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            // Get proper (for this test) cookie row.
            var row = FBTestFireCookie.getCookieRowByName(panelNode, "TestCookie18");

            // Test label displayed in the row.
            var value = FW.FBL.getElementByClass(row, "cookieValueLabel", "cookieLabel");
            FBTest.compare("1 + 2 = 3", value.textContent, "Value of the cookie validation");

            // Expand cookie info.
            FBTest.click(row);

            // Get the only expanded info element and select Raw Value tab so, its
            // content is also generated.
            var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow")[0];
            FBTest.expandElements(cookieInfo, "cookieInfoRawValueTab");

            // Verify content of the Value tab.
            var infoValue = FW.FBL.getElementByClass(cookieInfo,
                "cookieInfoValueText", "cookieInfoText");
            FBTest.compare("1 + 2 = 3", infoValue.textContent,
                "Value of the cookie (in the body) validation");

            // Verify content of the Raw Value tab.
            var rawInfoValue = FW.FBL.getElementByClass(cookieInfo,
                "cookieInfoRawValueText", "cookieInfoText");
            FBTest.compare("1+%2B+2+%3D+3", rawInfoValue.textContent,
                "Raw value of the cookie (in the body) validation");

            // Finish test
            FBTest.testDone("cookies.test.issue18; DONE");
        });
    });
};
