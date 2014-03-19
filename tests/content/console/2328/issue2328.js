// 1) Open test page.
// 2) Open Firebug and enable the Console panel.
// 3) Register UI mutation handler.
// 4) Execute test on the page.
// 5) Verify UI.

function runTest()
{
    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.openNewTab(basePath + "console/2328/issue2328.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                // Create listener for mutation events.
                var doc = FBTest.getPanelDocument();
                var recognizer = new MutationRecognizer(doc.defaultView, "div",
                    {"class": "logRow logRow-spy loaded"});

                // Wait for an error log in the Console panel.
                recognizer.onRecognize(function (element)
                {
                    // Verify error log in the console.
                    var expectedResult = "GET " + basePath + "console/2328/issue2328.php";
                    var spyFullTitle = FW.FBL.getElementByClass(element, "spyFullTitle");
                    FBTest.compare(expectedResult, spyFullTitle.textContent, "There must be a XHR log");

                    FBTest.setPref("showXMLHttpRequests", prefOrigValue);
                    FBTest.testDone();
                });

                // Run test implemented on the page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
