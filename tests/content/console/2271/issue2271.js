// 1) Make sure "Show XMLHttpRequests" option is on.
// 2) Open test page.
// 3) Open Firebug and enable the Console panel.
// 4) Execute test on the page.
// 5) Verify UI.

function runTest()
{
    FBTest.sysout("issue2271.START");

    var prefOrigValue = FBTest.getPref("showXMLHttpRequests");
    FBTest.setPref("showXMLHttpRequests", true);

    FBTest.enableConsolePanel();
    FBTest.openNewTab(basePath + "console/2271/issue2271.html", function(win)
    {
        FBTest.sysout("issue2271; Test page loaded.");

        FBTest.openFirebug();
        FBTest.selectPanel("console");

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
            FBTest.testDone("issue2271; DONE");
        });

        // Run test implemented on the page.
        FBTest.click(win.document.getElementById("testButton"));
    });
}
