// Test entry point.
function runTest()
{
    FBTest.sysout("issue2696.START");

    // Disable XHR spy for this test.
    FBTest.setPref("showXMLHttpRequests", false);

    // 1) Load test case page
    FBTest.openNewTab(basePath + "net/2696/issue2696.html", function(win)
    {
        // 2) Open Firebug and enable the Net panel.
        FBTest.openFirebug();
        FBTest.enableNetPanel(function(win)
        {
            // 3) Select Net panel
            var panel = FW.Firebug.chrome.selectPanel("net");

            // Asynchronously wait for the request beeing displayed.
            onRequestDisplayed(function(netRow)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");
                var netRow = FW.FBL.getElementByClass(panel.panelNode, "netRow", "category-xhr",
                    "hasHeaders", "loaded");

                FBTest.ok(netRow, "There must be just one xhr request.");
                if (!netRow)
                    return FBTest.testDone();

                FBTest.click(netRow);

                // 5) Expand the test request entry
                var netInfoRow = netRow.nextSibling;
                FBTest.expandElements(netInfoRow, "netInfoResponseTab");

                var responseBody = FW.FBL.getElementByClass(panel.panelNode, "netInfoResponseText",
                    "netInfoText");

                // 6) Verify response
                FBTest.ok(responseBody, "Response tab must exist");
                if (responseBody)
                    FBTest.compare("Test response for 2696.",
                        responseBody.textContent, "Test response must match.");

                // 7) Finish test
                FBTest.testDone("issue2696.DONE");
            });

            // 4) Execute test by clicking on the 'Execute Test' button.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
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
