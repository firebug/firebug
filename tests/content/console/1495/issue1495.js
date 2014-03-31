// Test entry point.
function runTest()
{
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "console/1495/issue1495.html", function(win)
    {
        FBTest.enableConsolePanel(function()
        {
            var panel = FBTest.getSelectedPanel()

            onAllFourRequestsDisplayed(function()
            {
                // Expand all XHR logs in the Console panel.
                var rows = panel.panelNode.getElementsByClassName("logRow logRow-spy loaded");

                for (var i = 0; i < rows.length; i++)
                {
                    var logRow = rows[i];
                    var clickTarget = logRow.getElementsByClassName("spyTitleCol spyCol")[0];
                    FBTest.click(clickTarget);
                    FBTest.expandElements(clickTarget, "netInfoResponseTab");

                    var title = clickTarget.getElementsByClassName("spyFullTitle")[0];

                    var responseBody = logRow.
                        getElementsByClassName("netInfoResponseText netInfoText")[0];
                    FBTest.ok(responseBody, "Response tab must exist for request");

                    if (responseBody)
                    {
                        FBTest.ok(responseBody.textContent, "Response tab must not be empty - " +
                            title.textContent);
                    }
                }

                // Finish test
                FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("runTest"));
        });
    });
}

function onAllFourRequestsDisplayed(callback)
{
    // Wait for a XHR log to appear in the Net panel.
    FBTest.waitForDisplayedElement("console", null, () =>
    {
        var panelNode = FBTest.getPanel("console").panelNode;
        var nodes = panelNode.getElementsByClassName("logRow logRow-spy loaded");

        if (nodes.length == 4)
            callback();
        else
            onAllFourRequestsDisplayed(callback);
    });
}
