window.FBTestTimeout = 15000;

function runTest()
{
    FBTest.openNewTab(basePath + "net/846/Issue846.htm", function(win)
    {
        // Disable XHR spy.
        var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
        FBTest.setPref("showXMLHttpRequests", false);

        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            win.runTest(function(responses)
            {
                FBTest.sysout("issue846.onRunTest", responses);

                // Expand all requests and select respnose bodies.
                var panel = FW.Firebug.chrome.selectPanel("net");
                FBTest.expandElements(panel.panelNode, "netRow", "category-xhr", "hasHeaders", "loaded");
                FBTest.expandElements(panel.panelNode, "netInfoResponseTab");

                var netRows = FW.FBL.getElementsByClass(panel.panelNode, "netRow", "category-xhr",
                    "hasHeaders", "loaded");
                FBTest.compare(responses.length, netRows.length,
                    "There must be correct number of XHRs");

                for (var i=0; i<netRows.length; i++)
                {
                    var row = netRows[i];
                    var responseBody = FW.FBL.getElementByClass(row.nextSibling,
                        "netInfoResponseText", "netInfoText");
                    FBTest.compare(responses[i], responseBody.textContent,
                        "Test response must match");
                }

                // Finish test
                FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                FBTest.testDone();
            });
        });
    });
}
