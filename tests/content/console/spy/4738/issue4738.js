function runTest()
{
    FBTest.openNewTab(basePath + "console/spy/4738/issue4738.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableConsolePanel(() =>
            {
                var options = {
                    tagName: "div",
                    classes: "logRow logRow-spy error loaded",
                    counter: 2
                };

                FBTest.waitForDisplayedElement("console", options, (row) =>
                {
                    var panel = FBTest.getSelectedPanel();
                    var requests = panel.panelNode.getElementsByClassName(
                        "logRow logRow-spy error loaded");
                    FBTest.compare(2, requests.length, "There must be 2 requests");

                    var requestHead = panel.panelNode.getElementsByClassName("spyHead")[0];

                    function executeContextMenuCommand()
                    {
                        FBTest.executeContextMenuCommand(requestHead, "fbSpyCopyLocation");
                    }

                    var expected = /path1$/;
                    FBTest.waitForClipboard(expected, executeContextMenuCommand, (text) =>
                    {
                        FBTest.compare(expected, text, "Proper URL must be copied. Current: " +
                            text);
                        FBTest.testDone();
                    });
                });

                FBTest.clickContentButton(win, "testButton");
            });
        });
    });
}
