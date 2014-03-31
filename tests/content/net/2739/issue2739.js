// Test entry point.
function runTest()
{
    // Disable XHR spy for this test.
    FBTest.setPref("showXMLHttpRequests", false);

    // Load test case page
    FBTest.openNewTab(basePath + "net/2739/issue2739.html", (win) =>
    {
        // Open Firebug and enable the Net panel.
        FBTest.openFirebug(() =>
        {
            FBTest.enableNetPanel(() =>
            {
                var config = {
                    tagName: "tr",
                    classes: "netRow category-xhr hasHeaders loaded",
                    count: 2
                };

                FBTest.waitForDisplayedElement("net", config, (netRow) =>
                {
                    verifyResponses();
                    FBTest.testDone();
                });

                // Execute test.
                FBTest.clickContentButton(win, "testButton");
            });
        });
    });
}

function verifyResponses(netRow)
{
    var panelNode = FBTest.getSelectedPanel().panelNode;

    FBTest.expandElements(panelNode, "category-xhr");
    FBTest.expandElements(panelNode, "netInfoResponseTab");

    var responses = panelNode.getElementsByClassName("netInfoResponseText");
    if (!FBTest.compare(2, responses.length, "There must be two xhr responses."))
        return;

    FBTest.compare("Response for test 2739:start", responses[0].textContent,
        "Test response #1 must match.");
    FBTest.compare("Response for test 2739:link", responses[1].textContent,
        "Test response #2 must match.");
}
