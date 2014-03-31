function runTest(request)
{
    FBTest.openNewTab(basePath + "net/372/issue372.html", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            win.runTest(function(request)
            {
                // Expand the test request with params
                var panelNode = FW.Firebug.chrome.selectPanel("net").panelNode;

                FBTest.expandElements(panelNode, "netRow", "category-xhr", "hasHeaders", "loaded");
                FBTest.expandElements(panelNode, "netInfoPostTab");

                // The post text must be displayed.
                var postBody = FW.FBL.getElementByClass(panelNode, "netInfoPostText");
                if (FBTest.ok(postBody, "Post tab must exist."))
                {
                    FBTest.compare(win.xml, postBody.textContent,
                        "Post tab body content verified");
                }

                // Finish test
                FBTest.testDone();
            })
        });
    })
}
