function runTest()
{
    FBTest.sysout("issue6054.START");

    FBTest.openNewTab(basePath + "css/6054/issue6054.html", function(win)
    {
        FBTest.openFirebug();

        // Should better be set via the menu
        FBTest.setPref("colorDisplay", "hex");

        FBTest.selectElementInHtmlPanel("element", function(node)
        {
            var panel = FBTest.selectSidePanel("css");
            var rule = panel.panelNode.getElementsByClassName("cssRule").item(0);

            var expectedValue = new RegExp("#element\\s*\\{(.|[(\r\n])*?" +
            	"-moz-linear-gradient\\(135deg,\\s*#788CFF,\\s*#B4C8FF\\);(.|[(\r\n])*?\\}");
            FBTest.waitForClipboard(expectedValue, function(copiedValue)
            {
                FBTest.compare(expectedValue, copiedValue, "Rule must be copied with colors in hexadecimal format");
                FBTest.testDone("issue6054; DONE");
            });

            FBTest.executeContextMenuCommand(rule, "fbCopyRuleDeclaration");
        });
    });
}
