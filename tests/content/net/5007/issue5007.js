function runTest()
{
    FBTest.sysout("issue5007.START");

    FBTest.openNewTab(basePath + "net/5007/issue5007.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("net");

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
                    FBTest.ok(headersBody.textContent.indexOf("Content-Type"),
                        "Content-Type header exists");
                    FBTest.ok(headersBody.textContent.indexOf("Content-Length"),
                        "Content-Length header exists");
                }

                FBTest.testDone("issue5007.DONE");
            });

            FBTest.click(win.document.getElementsByTagName("button").item(0));
        });
    });
}
