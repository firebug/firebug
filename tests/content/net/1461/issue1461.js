function runTest()
{
    FBTest.openNewTab(basePath + "net/1461/issue1461.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Enable and switch to the Net panel
            FBTest.enableNetPanel();

            var options =
            {
                tagName: "tr",
                classes: "netRow category-html hasHeaders loaded"
            };

            FBTest.waitForDisplayedElement("net", options, function()
            {
                var panelNode = FBTest.getSelectedPanel().panelNode;

                // 4. Expand the request for "issue1461.html"
                FBTest.expandElements(panelNode, "netRow", "category-html", "hasHeaders", "loaded");

                // 5. Switch to the Response tab
                FBTest.expandElements(panelNode, "netInfoResponseTab");
                var responseBody = panelNode.getElementsByClassName("netInfoResponseText netInfoText")[0];

                // The response must be displayed.
                if (!FBTest.ok(responseBody, "Response tab must exist"))
                    return FBTest.testDone(win);

                var partOfThePageSource = new RegExp("<title>Issue 1461: Failed to load source for sourceFile " +
                    "\\(FF 3\\.0\\.6 FireBug 1\\.3\\.2\\)<\\/title>");
                FBTest.compare(partOfThePageSource, responseBody.textContent, "Proper response must be there");

                FBTest.testDone();
            });

            // 3. Reload the page
            FBTest.reload();
        });
    });
}
