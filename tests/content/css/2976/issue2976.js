function runTest()
{
    FBTest.openNewTab(basePath + "css/2976/issue2976.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                FW.Firebug.chrome.selectPanel("html");

                FBTest.selectElementInHtmlPanel("myElement", function(node)
                {
                    var stylePanel = FW.Firebug.chrome.selectSidePanel("css");
                    var cssSelector = stylePanel.panelNode.getElementsByClassName("cssSelector")[0];

                    function executeContextMenuCommand()
                    {
                        FBTest.executeContextMenuCommand(cssSelector, "fbCopyStyleDeclaration");
                    }

                    var expected = new RegExp("background-color: LightYellow;\\s*" +
                        "color: red !important;\\s*font-weight: bold;");
                    FBTest.waitForClipboard(expected, executeContextMenuCommand, function(text)
                    {
                        FBTest.compare(expected, text,
                            "CSS declaration must be properly copied into the clipboard");
                        FBTest.testDone();
                    });
                })
            });
        });
    });
}
