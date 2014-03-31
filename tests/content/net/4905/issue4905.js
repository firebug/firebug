function runTest()
{
    FBTest.openNewTab(basePath + "net/4905/issue4905.html", function(win)
    {
        FBTest.openFirebug(function()
        {
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
                var panelNode = FBTest.getSelectedPanel().panelNode;

                var options =
                {
                    tagName: "td",
                    classes: "netInfoParamName"
                };

                FBTest.waitForDisplayedElement("net", options, function()
                {
                    var rows = panelNode.querySelectorAll(
                        ".netInfoRow.category-undefined.outerFocusRow");

                    FBTest.compare(2, rows.length, "There must be two requests coming from the cache");

                    for (var i=0, len=rows.length; i<len; ++i)
                    {
                        FBTest.expandElements(rows[i], "netInfoHeadersTab");

                        var headersBody = FW.FBL.getElementByClass(rows[i],
                            "netInfoCachedResponseHeadersBody");
                        if (FBTest.ok(headersBody, "Cached response headers must exist"))
                        {
                            FBTest.compare(/Cache-Control\s*max-age=10,\s*public/,
                                headersBody.textContent, "'Cache-Control' header must exist");
                        }
                    }

                    // Disable browser cache again if it was disabled before
                    if (!browserCacheEnabled)
                        browserCache.toggle(false);

                    FBTest.testDone();
                });

                FBTest.expandElements(panelNode, "netRow", "category-undefined",
                    "hasHeaders", "loaded", "fromCache");
            });

            FBTest.reload();
        });
    });
}
