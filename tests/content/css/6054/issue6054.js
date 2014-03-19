function runTest()
{
    FBTest.openNewTab(basePath + "css/6054/issue6054.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            // Should better be set via the menu
            FBTest.setPref("colorDisplay", "hex");

            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var rule = panel.panelNode.getElementsByClassName("cssRule").item(0);

                function executeContextMenuCommand()
                {
                    FBTest.executeContextMenuCommand(rule, "fbCopyRuleDeclaration");
                }

                var expectedValue = new RegExp("#element\\s*\\{(.|[(\r\n])*?" +
                    "-moz-linear-gradient\\(135deg,\\s*#788CFF,\\s*#B4C8FF\\);(.|[(\r\n])*?\\}");
                FBTest.waitForClipboard(expectedValue, executeContextMenuCommand,
                    function(copiedValue)
                {
                    FBTest.compare(expectedValue, copiedValue,
                        "Rule must be copied with colors in hexadecimal format");
                    FBTest.testDone();
                });
            });
        });
    });
}
