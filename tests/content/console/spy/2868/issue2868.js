function runTest()
{
    FBTest.setPref("showXMLHttpRequests", true);
    FBTest.openNewTab(basePath + "console/spy/2868/issue2868.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.waitForDisplayedElement("console", null, function(row)
                {
                    var clickTarget = row.getElementsByClassName("spyTitleCol spyCol")[0];
                    FBTest.click(clickTarget);

                    var responseNode = row.getElementsByClassName(
                        "netInfoResponseText netInfoText")[0];

                    if (FBTest.ok(responseNode, "Response tab must exist in"))
                    {
                        FBTest.compare("Response for test 2868.", responseNode.textContent,
                            "Response text must match.");
                    }

                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
