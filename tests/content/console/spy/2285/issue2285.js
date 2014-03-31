var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
var FF22OrHigher = versionChecker.compare(appInfo.version, "21.*") >= 0;

function runTest()
{
    FBTest.openNewTab(basePath + "console/spy/2285/issue2285.html", function(win)
    {
        FBTest.enableConsolePanel(function()
        {
            var panel = FW.Firebug.chrome.selectPanel("console");

            // Run test implemented on the page.
            function testDone(event)
            {
                win.document.removeEventListener("test-done", testDone, false);

                // Expand XHR log in the Console panel.
                var rows = FW.FBL.getElementsByClass(panel.panelNode,
                    "logRow", "logRow-spy", "loaded");

                FBTest.compare(1, rows.length, "There must be just on XHR.");

                if (rows.length > 0)
                {
                    var logRow = rows[0];
                    var clickTarget = FW.FBL.getElementByClass(logRow, "spyTitleCol", "spyCol");
                    FBTest.click(clickTarget);
                    FBTest.expandElements(clickTarget, "netInfoResponseTab");

                    var responseBody = FW.FBL.getElementByClass(logRow, "netInfoResponseText", "netInfoText");
                    FBTest.ok(responseBody, "Response tab must exist in");
                    if (responseBody)
                    {
                        // If the activity-observer is available the response is correct.
                        // Otherwise only the first part of the multipart XHR is displayed.
                        var response = Cc["@mozilla.org/network/http-activity-distributor;1"]
                            ? "Part0+Part1+Part2+Part3+" : "Part0+";
                        FBTest.compare(response, responseBody.textContent, "Response text must match.");
                    }
                }

                // Finish test
                FBTest.testDone();
            };

            win.document.addEventListener("test-done", testDone, false);

            if (FF22OrHigher)
                FBTest.click(win.document.getElementById("testButton2"));
            else
                FBTest.click(win.document.getElementById("testButton1"));
        });
    });
}
