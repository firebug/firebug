function runTest()
{
    FBTest.sysout("issue6535.START");

    FBTest.openNewTab(basePath + "cookies/6535/issue6535.php", function(win)
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
                if (FBTest.ok(label, "Cookies maxAge label must exist"))
                {
                    FBTest.compare("1d 10h 17m 36s", label.textContent,
                        "Max age must match");
                }

                FBTest.testDone("issue6535.DONE");
            });
        });
    });
}
