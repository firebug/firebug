function runTest()
{
    // Enable XHR spy.
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "net/1275/issue1275.htm", (win) =>
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["net", "console"], () =>
            {
                FBTest.clearCache();

                // Reload test page.
                FBTest.reload(function()
                {
                    FBTest.waitForDisplayedElement("net", null, (row) =>
                    {
                        // Verify Net panel response
                        var panel = FBTest.getSelectedPanel();
                        FBTest.click(row);
                        verifyResponse(panel);

                        // Verify Console panel response
                        panel = FBTest.selectPanel("console");
                        var spyLogRow = panel.panelNode.
                            getElementsByClassName("logRow logRow-spy loaded")[0];
                        var xhr = spyLogRow.getElementsByClassName("spyTitleCol spyCol")[0];
                        FBTest.click(xhr);
                        verifyResponse(panel);

                        FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                        FBTest.testDone();
                    });

                    FBTest.click(win.document.getElementById("testButton"));
                });
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
        FBTest.compare("{ data1: 'value1', data2: 'value2' }",
            responseBody.textContent, "Test JSON response must match in: " + panel.name);
    }
}
