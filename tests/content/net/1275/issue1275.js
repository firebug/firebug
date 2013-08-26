function runTest()
{
    // Enable XHR spy.
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "net/1275/issue1275.htm", function(win)
    {
        FBTest.sysout("issue1275.START");

        // Open Firebug UI and enable Net panel.
        FBTest.openFirebug();
        FBTest.enableNetPanel();
        FBTest.enableConsolePanel();
        FBTest.clearCache();
        FBTest.selectPanel("net");

        // Reload test page.
        FBTest.reload(function()
        {
            onRequestDisplayed("tr", "netRow category-xhr hasHeaders loaded", function(row)
            {
                // Verify Net panel response
                var panel = FBTest.getPanel("net");
                FBTest.click(row);
                verifyResponse(panel);

                // Verify Console panel response
                panel = FBTest.getPanel("console");
                var spyLogRow = FW.FBL.getElementByClass(panel.panelNode, "logRow",
                    "logRow-spy", "loaded");
                var xhr = FW.FBL.getElementByClass(spyLogRow, "spyTitleCol", "spyCol");
                FBTest.click(xhr);
                verifyResponse(panel);

                FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                FBTest.testDone("issue1275.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    })
}

function verifyResponse(panel)
{
    // The response must be displayed to be populated in the UI.
    FBTest.expandElements(panel.panelNode, "netInfoResponseTab");
    var responseBody = FW.FBL.getElementByClass(panel.panelNode, "netInfoResponseText",
        "netInfoText");

    FBTest.ok(responseBody, "Response tab must exist in: " + panel.name);
    if (responseBody)
        FBTest.compare("{ data1: 'value1', data2: 'value2' }",
            responseBody.textContent, "Test JSON response must match in: " + panel.name);
}

function onRequestDisplayed(nodeName, classes, callback)
{
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, nodeName, {"class": classes});
    recognizer.onRecognizeAsync(callback);
}
