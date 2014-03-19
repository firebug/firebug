function runTest()
{
    FBTest.setPref("showXMLHttpRequests", true);
    FBTest.openNewTab(basePath + "console/spy/4171/issue4171.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var options = {
                    tagName: "div",
                    classes: "logRow logRow-spy loading"
                };

                // Wait till the XHR request in the Console appear (loading in progress)
                FBTest.waitForDisplayedElement("console", options, function(row)
                {
                    var clickTarget = row.getElementsByClassName("spyTitleCol spyCol")[0];
                    FBTest.click(clickTarget);

                    // At this point, there is only Header tab.
                    var tab = row.getElementsByClassName("netInfoHeadersText netInfoText")[0];
                    FBTest.ok(tab, "Headers tab must exist");

                    // Wait till the XHR request finishes (changes its state to loaded)
                    options.classes = "logRow logRow-spy loaded";
                    FBTest.waitForDisplayedElement("console", options, function(row)
                    {
                        // Now there must be both: the Response and JSON tab.
                        var tab = row.getElementsByClassName("netInfoResponseText netInfoText")[0];
                        FBTest.ok(tab, "Response tab must exist");

                        tab = row.getElementsByClassName("netInfoJSONText netInfoText")[0];
                        FBTest.ok(tab, "JSON tab must exist");

                        FBTest.testDone();
                    });
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
