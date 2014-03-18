function runTest()
{
    FBTest.openNewTab(basePath + "cookies/6535/issue6535.php", function(win)
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

                var selector = ".netInfoReceivedCookies .cookieRow .cookieMaxAgeLabel";
                var label = panelNode.querySelector(selector);
                if (FBTest.ok(label, "Cookies maxAge label must exist"))
                {
                    FBTest.compare("1d 10h 17m 36s", label.textContent,
                        "Max age must match");
                }

                FBTest.testDone();
            });
        });
    });
}
