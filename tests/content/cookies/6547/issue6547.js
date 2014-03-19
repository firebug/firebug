function runTest()
{
    FBTest.openNewTab(basePath + "cookies/6547/issue6547.php", function(win)
    {
        FBTest.enablePanels(["net", "cookies"], function()
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
                    issue6547_zero: "0ms",
                    issue6547_pos:  "1d 10h 17m 36s",
                    issue6547_neg:  "-1d 10h 17m 36s",
                };

                for (var i = 0; i < rows.length; i++)
                {
                    var row = rows[i];

                    var cookieName = row.querySelector(".cookieNameLabel").textContent;
                    var expResult = resultMap[cookieName];
                    var result = row.querySelector(".cookieMaxAgeLabel").textContent;

                    FBTest.compare(expResult, result, "Max age must be " + expResult);
                }

                FBTest.testDone();
            });
        });
    });
}
