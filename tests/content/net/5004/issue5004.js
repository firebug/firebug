function runTest()
{
    FBTest.openNewTab(basePath + "net/5004/issue5004.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var options =
                {
                    tagName: "tr",
                    classes: "netRow category-html hasHeaders loaded"
                };

                var panel = FBTest.selectPanel("net");
                panel.clear();

                FBTest.waitForDisplayedElement("net", options, function(row)
                {
                    // Expand the test request with params
                    var panelNode = FBTest.selectPanel("net").panelNode;

                    FBTest.click(row);
                    FBTest.expandElements(panelNode, "netInfoPostTab");

                    // The post text must be displayed.
                    var postBody = FW.FBL.getElementByClass(panelNode, "netInfoPostText");
                    if (FBTest.ok(postBody, "Post tab must exist."))
                    {
                        FBTest.compare(/application\/x-www-form-urlencoded.*paramvalue.*param=value/,
                            postBody.textContent, "Post tab body content verified");
                    }

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementsByTagName("button").item(0));
            });
        });
    });
}
