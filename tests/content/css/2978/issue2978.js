function runTest()
{
    FBTest.openNewTab(basePath + "css/2978/issue2978.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("myElement", function(sel)
            {
                FBTest.progress("issue2978; Selection:", sel);

                var nodeTag = sel.getElementsByClassName("nodeTag")[0];

                function executeContextMenuCommand()
                {
                    FBTest.executeContextMenuCommand(nodeTag, "fbCopyCSSPath");
                }

                var expected = "html body div.myClass span#myElement";
                FBTest.waitForClipboard(expected, executeContextMenuCommand, function(cssPath)
                {
                    var cssPath = FBTest.getClipboardText();
                    FBTest.compare(expected, cssPath,
                        "CSS path must be properly copied into the clipboard");
                    FBTest.testDone();
                });
            });
        });
    });
}
