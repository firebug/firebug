function runTest()
{
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "console/2271/issue2271.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableConsolePanel(() =>
            {
                var config = {
                    tagName: "div",
                    classes: "logRow logRow-errorMessage"
                };

                FBTest.waitForDisplayedElement("console", config, (element) =>
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
