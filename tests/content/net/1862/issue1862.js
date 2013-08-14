function runTest()
{
    FBTest.sysout("issue1862.START");
    FBTest.openNewTab(basePath + "net/1862/issue1862.html", function()
    {
        // Open Firebug UI and enable Net panel.
        FBTest.openFirebug();
        FBTest.enableConsolePanel();
        FBTest.clearCache();

        // Enable XHR spy.
        var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
        FBTest.setPref("showXMLHttpRequests", true);

        FW.Firebug.chrome.selectPanel("net");

        // Reload test page.
        FBTest.enableNetPanel(function(win)
        {
            onRequestDisplayed(function()
            {
                // Verify Net panel response
                var panel = FBTest.getPanel("net");
                FBTest.expandElements(panel.panelNode, "netRow", "category-xhr", "hasHeaders", "loaded");
                verifyResponse(panel);

                // Verify Console panel response
                panel = FBTest.selectPanel("console");
                var spyLogRow = FW.FBL.getElementByClass(panel.panelNode, "logRow", "logRow-spy", "loaded");
                var xhr = FW.FBL.getElementByClass(spyLogRow, "spyTitleCol", "spyCol");
                FBTest.click(xhr);
                verifyResponse(panel);

                // Finish test
                FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                FBTest.testDone("issue1862.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    })
}

function onRequestDisplayed(callback)
{
    // Create listener for mutation events.
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "tr",
        {"class": "netRow category-xhr loaded"});

    // Wait for a XHR log to appear in the Net panel.
    recognizer.onRecognizeAsync(callback);
}

function verifyResponse(panel)
{
    // The response must be displayed to be populated in the UI.
    FBTest.expandElements(panel.panelNode, "netInfoResponseTab");
    var responseBody = FW.FBL.getElementByClass(panel.panelNode, "netInfoResponseText",
        "netInfoText");

    FBTest.ok(responseBody, "Response tab must exist in: " + panel.name);
    if (responseBody)
        FBTest.compare("<root><div>Simple XML document</div></root>",
            responseBody.textContent, "Test XML response must match in: " + panel.name);
}
