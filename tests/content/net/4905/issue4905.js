function runTest()
{
    FBTest.sysout("issue4905.START");

    FBTest.openNewTab(basePath + "net/4905/issue4905.html", function(win)
    {
        FBTest.openFirebug();

        var diskCache = FW.Firebug.getPref("browser.cache", "disk.enable");
        var memoryCache = FW.Firebug.getPref("browser.cache", "memory.enable");
        FBTest.progress("disk: " + diskCache + ", memory: " + memoryCache);

        // Enable browser cache
        var browserCache = FW.Firebug.NetMonitor.BrowserCache;
        var browserCacheEnabled = browserCache.isEnabled();
        browserCache.toggle(true);

        FBTest.selectPanel("net");
        FBTest.enableNetPanel();

        var options =
        {
            tagName: "tr",
            classes: "netRow category-undefined hasHeaders loaded fromCache",
            counter: 2
        };

        FBTest.waitForDisplayedElement("net", options, function()
        {
            var panelNode = FBTest.getPanel("net").panelNode;
            var rows = panelNode.querySelectorAll(
                ".netRow.category-undefined.hasHeaders.loaded.fromCache");

            FBTest.compare(2, rows.length, "There must be two requests coming from the cache: " +
                rows.length);

            for (var i=0; i<rows.length; i++)
            {
                var row = rows[i];

                FBTest.progress("row " + i);

                FBTest.click(row);
                FBTest.expandElements(panelNode, "netInfoPostTab");

                var title = FW.FBL.getElementByClass(panelNode, "netInfoCachedResponseHeadersTitle");
                if (FBTest.ok(title, "Cached response headers must exist"))
                {
                    var headers = title.nextSibling;
                    var body = headers.getElementsByClassName(
                        "netInfoCachedResponseHeadersBody").item(0);

                    FBTest.ok(body.children.length > 0, "There must be some cached response headers");
                    FBTest.compare(/Cache-Control/, headers.textContent,
                        "Cached response headers must include 'Cache-Control' header");
                }
            }

            // Disable browser cache again if it was disabled before
            if (!browserCacheEnabled)
                browserCache.toggle(false);

            FBTest.testDone("issue4905.DONE");
        });

        FBTest.reload();
    });
}
