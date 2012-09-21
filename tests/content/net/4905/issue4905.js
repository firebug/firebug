function runTest()
{
    FBTest.sysout("issue4905.START");

    FBTest.openNewTab(basePath + "net/4905/issue4905.html", function(win)
    {
        FBTest.openFirebug();

        // Enable browser cache
        var browserCache = FW.Firebug.NetMonitor.BrowserCache;
        var browserCacheEnabled = browserCache.isEnabled();
        browserCache.toggle(true);
        
        FBTest.selectPanel("net");
        FBTest.enableNetPanel();

        var options =
        {
            tagName: "tr",
            classes: "netRow category-undefined hasHeaders loaded",
            counter: 2
        };

        var callbackFunction = function(row)
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

            // Disable browser cache again if it was disabled before
            if (!browserCacheEnabled)
                browserCache.toggle(false);

            FBTest.testDone("issue4905.DONE");
        };

        FBTest.waitForDisplayedElement("net", options, callbackFunction);

        FBTest.reload();
    });
}
