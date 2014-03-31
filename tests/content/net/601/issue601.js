function runTest()
{
    // must be set to false in this test, but the original value is reverted.
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", false);

    FBTest.openNewTab(basePath + "net/601/issue601.html", (win) =>
    {
        FBTest.enableNetPanel((win) =>
        {
            FBTest.waitForDisplayedElement("net", null, (row) =>
            {
                // Expand Net's panel UI so, it's populated with data.
                var panelNode = FBTest.getSelectedPanel().panelNode;
                FBTest.expandElements(panelNode, "netRow", "category-xhr");
                FBTest.expandElements(panelNode, "netInfoResponseTab");

                var responseBody = FW.FBL.getElementByClass(panelNode, "netInfoResponseText",
                    "netInfoText");
                var responseText = responseBody.textContent;

                FBTest.ok(responseBody, "Response tab must exist.");

                // The posted data are store in the page. Note that any access to the page
                // needs to support e10s.
                var postElement = win.document.getElementById("postData");
                FBTest.compare(postElement.innerHTML, responseText, "Test response must match.");

                FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                FBTest.testDone();
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}
