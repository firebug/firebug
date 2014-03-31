// Test entry point.
function runTest()
{
    // Disable XHR spy for this test.
    FBTest.setPref("showXMLHttpRequests", false);

    // 1) Load test case page
    FBTest.openNewTab(basePath + "net/2696/issue2696.html", (win) =>
    {
        // 2) Open Firebug and enable the Net panel.
        FBTest.openFirebug(() =>
        {
            // 3) Select Net panel
            FBTest.enableNetPanel(() =>
            {
                // Asynchronously wait for the request beeing displayed.
                FBTest.waitForDisplayedElement("net", null, (netRow) =>
                {
                    FBTest.ok(netRow, "There must be just one xhr request.");
                    if (!netRow)
                        return FBTest.testDone();

                    FBTest.click(netRow);

                    // 5) Expand the test request entry
                    var netInfoRow = netRow.nextSibling;
                    FBTest.expandElements(netInfoRow, "netInfoResponseTab");

                    var responseBody = netInfoRow.
                        getElementsByClassName("netInfoResponseText netInfoText")[0];

                    // 6) Verify response
                    if (FBTest.ok(responseBody, "Response tab must exist"))
                    {
                        FBTest.compare("Test response for 2696.",
                            responseBody.textContent, "Test response must match.");
                    }

                    // 7) Finish test
                    FBTest.testDone();
                });

                // 4) Execute test by clicking on the 'Execute Test' button.
                FBTest.clickContentButton(win, "testButton");
            });
        });
    });
}
