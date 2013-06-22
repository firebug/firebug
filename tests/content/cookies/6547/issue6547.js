function runTest()
{
    FBTest.sysout("issue6547.START");

    FBTest.openNewTab(basePath + "cookies/6547/issue6547.php", function(win)
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

                var selector = ".netInfoReceivedCookies .cookieRow .cookieMaxAgeLabel";
                var label = panelNode.querySelector(selector);

                FBTest.compare("0", label.textContent, "Max age must be zero");

                FBTest.testDone("issue6547.DONE");
            });
        });
    });
}
