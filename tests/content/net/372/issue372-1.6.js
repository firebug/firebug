function runTest(request)
{
    FBTest.openNewTab(basePath + "net/372/issue372-1.6.html", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                // Expand the test request with params
                var panelNode = FBTest.getPanel("net").panelNode;

                FBTest.click(netRow);
                FBTest.expandElements(panelNode, "netInfoPostTab");

                // The post text must be displayed.
                var postBody = panelNode.querySelector(".netInfoPostSourceTable .focusRow.subFocusRow");
                if (FBTest.ok(postBody, "Post tab must exist."))
                {
                    FBTest.progress(postBody.textContent);
                    FBTest.compare("<root><test id=\"1\"/></root>", postBody.textContent,
                        "Post tab body content verified");
                }

                // Finish test
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    })
}
