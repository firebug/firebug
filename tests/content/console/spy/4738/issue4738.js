function runTest()
{
    FBTest.sysout("issue4738.START");

    FBTest.openNewTab(basePath + "console/spy/4738/issue4738.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var options = {
                tagName: "div",
                classes: "logRow logRow-spy error loaded",
                counter: 2
            };

            FBTest.waitForDisplayedElement("console", options, function(row)
            {
                var panel = FBTest.selectPanel("console");
                var requests = panel.panelNode.getElementsByClassName("logRow logRow-spy error loaded");
                FBTest.compare(2, requests.length, "There must be 2 requests");

                FBTest.executeContextMenuCommand(requests[0].getElementsByClassName("spyTitle")[0],
                    "fbSpyCopyLocation", function()
                {
                    var expected = /path1$/;
                    FBTest.waitForClipboard(expected, function(text)
                    {
                        FBTest.compare(expected, text, "Proper URL must be copied. Current: " + text);
                        FBTest.testDone("issue4738.DONE");
                    });
                });
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

