// 1) Open Firebug UI
// 2) Enabel all panels
// 3) Select the Console panel
// 4) Register mutation recognizer
// 5) Handle error log in the console panel
// 6) Verify the error.
// 7) Verify status bar error text.

function runTest()
{
    // Enable showing network errors, the original value is reverted.
    var prefOrigValue = FBTest.getPref("showNetworkErrors");
    FBTest.setPref("showNetworkErrors", true);

    FBTest.openNewTab(basePath + "net/2297/issue2297.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "net"], function()
            {
                var config = {tagName: "div", classes: "logRow logRow-error"};
                FBTest.waitForDisplayedElement("console", config, function(element)
                {
                    // Verify error log in the console.
                    var expectedResult = "\"NetworkError: 404 Not Found - " + basePath +
                        "net/2297/" + "non-existing-script.js\"";
                    var message = element.getElementsByClassName("objectBox")[0];
                    FBTest.compare(expectedResult, message.textContent,
                        "There must be a Network Error with proper URL");

                    // Verify status bar text
                    var firebugButton = FW.top.document.getElementById("firebug-error-label");
                    var errorCount = firebugButton.getAttribute("value");
                    FBTest.compare(1, errorCount, "There must be 1 Error displayed in the status bar");

                    FBTest.setPref("showNetworkErrors", prefOrigValue);
                    FBTest.testDone();
                });

                // Reload the page to get an error in the console.
                FBTest.reload();
            });
        });
    });
}
