function runTest()
{
    FBTest.openNewTab(basePath + "net/1862/issue1862.html", () =>
    {
        FBTest.enablePanels(["net", "console"], () =>
        {
            // Enable XHR spy.
            var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
            FBTest.setPref("showXMLHttpRequests", true);

            // Reload test page.
            FBTest.reload(function(win)
            {
                FBTest.waitForDisplayedElement("net", null, () =>
                {
                    // Verify Net panel response
                    var panel = FBTest.getPanel("net");
                    FBTest.expandElements(panel.panelNode, "netRow", "category-xhr", "hasHeaders",
                        "loaded");
                    verifyResponse(panel);

                    // Verify Console panel response
                    panel = FBTest.selectPanel("console");
                    var spyLogRow = panel.panelNode.
                        getElementsByClassName("logRow logRow-spy loaded")[0];
                    var xhr = spyLogRow.getElementsByClassName("spyTitleCol spyCol")[0];
                    FBTest.click(xhr);
                    verifyResponse(panel);

                    // Finish test
                    FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    })
}

function verifyResponse(panel)
{
    // The response must be displayed to be populated in the UI.
    FBTest.expandElements(panel.panelNode, "netInfoResponseTab");
    var responseBody = FW.FBL.getElementByClass(panel.panelNode, "netInfoResponseText",
        "netInfoText");

    if (FBTest.ok(responseBody, "Response tab must exist in: " + panel.name))
    {
        FBTest.compare("<root><div>Simple XML document</div></root>",
            responseBody.textContent, "Test XML response must match in: " + panel.name);
    }
}
