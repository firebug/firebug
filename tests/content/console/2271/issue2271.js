function runTest()
{
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "console/2271/issue2271.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function ()
            {
                // Create listener for mutation events.
                var doc = FBTest.getPanelDocument();
                var recognizer = new MutationRecognizer(doc.defaultView, "div",
                    {"class": "logRow logRow-errorMessage"});

                // Wait for an error log in the Console panel.
                recognizer.onRecognize(function (element)
                {
                    // Verify error log in the console.
                    var expectedResult = /\s*document.getElementId is not a function/;
                    var errorTitle = element.getElementsByClassName("errorTitle").item(0);
                    FBTest.compare(expectedResult, errorTitle.textContent, "There must be an error log");

                    FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                    FBTest.testDone();
                });

                // Run test implemented on the page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
