function runTest()
{
    FBTest.sysout("issue4085.START");
    FBTest.setPref("showXMLHttpRequests", true);
    FBTest.openNewTab(basePath + "console/spy/4085/issue4085.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var options = {
                tagName: "div",
                classes: "logRow logRow-errorMessage",
                counter: 1
            };

            FBTest.waitForDisplayedElement("console", options, function(row)
            {
                FBTest.testDone("issue4085.jsonViewer.DONE");
            });

            // Execute test implemented on the test page.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
