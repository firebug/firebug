// Test entry point.
function runTest()
{
    FBTest.sysout("issue1461.START");
    FBTest.openNewTab(basePath + "net/1461/issue1461.html", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("net");

            var panelNode = FW.Firebug.currentContext.getPanel("net").panelNode;
            FBTest.expandElements(panelNode, "netRow", "category-html", "hasHeaders", "loaded");
            FBTest.expandElements(panelNode, "netInfoResponseTab");

            var responseBody = FW.FBL.getElementByClass(panelNode, "netInfoResponseText",
                "netInfoText");

            // The response must be displayed.
            FBTest.ok(responseBody, "Response tab must exist.");
            if (!responseBody)
                return FBTest.testDone(win);

            var partOfThePageSource = "<h1>Test for Issue #1461</h1>";
            var index = responseBody.textContent.indexOf(partOfThePageSource);
            FBTest.ok(index != -1, "The proper response is there.");

            FBTest.testDone("issue1461.DONE");
        });
    });
}
