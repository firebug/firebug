function runTest()
{
    FBTest.sysout("issue4905.START");

    FBTest.openNewTab(basePath + "net/4905/issue4905.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("net");
        FBTest.enableNetPanel();

        var options =
        {
            tagName: "tr",
            classes: "netRow category-undefined hasHeaders loaded",
            counter: 2
        };

        FBTest.waitForDisplayedElement("net", options, function(row)
        {
            var panelNode = FBTest.selectPanel("net").panelNode;

            FBTest.click(row);
            FBTest.expandElements(panelNode, "netInfoPostTab");

            var cachedResponseHeadersTitle = FW.FBL.getElementByClass(panelNode,
                "netInfoCachedResponseHeadersTitle");
            if (FBTest.ok(cachedResponseHeadersTitle, "Cached response headers must exist"))
            {
                var cachedResponseHeaders = cachedResponseHeadersTitle.nextSibling;
                var cachedResponseHeadersBody = cachedResponseHeaders.
                    getElementsByClassName("netInfoCachedResponseHeadersBody").item(0);
                FBTest.ok(cachedResponseHeadersBody.children.length > 0,
                    "There must be some cached response headers");
                FBTest.compare(/Cache-Control/,
                    cachedResponseHeaders.textContent,
                    "Cached response headers must include 'Cache-Control' header");
            }

            FBTest.testDone("issue4905.DONE");
        });

        FBTest.reload();
    });
}
