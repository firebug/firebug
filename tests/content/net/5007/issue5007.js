function runTest()
{
    FBTest.openNewTab(basePath + "net/5007/issue5007.html", function(win)
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
                    var panelNode = FBTest.selectPanel("net").panelNode;

                    FBTest.click(row);
                    FBTest.expandElements(panelNode, "netInfoPostTab");

                    var headersBody = FW.FBL.getElementByClass(panelNode, "netInfoResponseHeadersBody");
                    if (FBTest.ok(headersBody, "Response headers must exist"))
                    {
                        FBTest.ok(headersBody.textContent.indexOf("Content-Type") !== -1,
                            "Content-Type header exists");
                        FBTest.ok(headersBody.textContent.indexOf("Content-Length") !== -1,
                            "Content-Length header exists");
                    }

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementsByTagName("button").item(0));
            });
        });
    });
}
