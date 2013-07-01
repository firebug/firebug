function runTest()
{
    FBTest.sysout("issue6570.START");

    FBTest.openNewTab(basePath + "cookies/6570/issue6570.php", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("net");

        FBTestFireCookie.enableCookiePanel();
        FBTest.enableNetPanel(function(win)
        {
            var options =
            {
                tagName: "tr",
                classes: "netRow category-html hasHeaders loaded"
            };

            FBTest.waitForDisplayedElement("net", options, function(row)
            {
                var panelNode = FBTest.selectPanel("net").panelNode;

                FBTest.click(row);
                FBTest.expandElements(panelNode, "netInfoCookiesTab");

                var selector = ".netInfoReceivedCookies .cookieRow";
                var rows = panelNode.querySelectorAll(selector);

                var resultMap =
                {
                        issue6570_session: false,
                        issue6570_maxage_future: false,
                        issue6570_maxage_delete: true,
                        issue6570_expiry_future: false,
                        issue6570_expiry_delete: true,
                        issue6570_delete: true
                };

                FBTest.compare(rows.length, Object.keys(resultMap).length, "There should be " + Object.keys(resultMap).length + " cookies.");

                for (var i = 0; i < rows.length; i++)
                {
                    var row = rows[i];

                    var cookieName = row.querySelector(".cookieNameLabel").textContent;
                    var expResult = resultMap[cookieName];
                    var result = row.className.indexOf('deletedCookie') !== -1;

                    FBTest.compare(expResult, result, "Cookie should be marked as " + (expResult ? "deleted." : "not deleted."));
                }

                FBTest.testDone("issue6570.DONE");
            });
        });
    });
}
