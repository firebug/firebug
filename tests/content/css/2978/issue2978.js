function runTest()
{
    FBTest.sysout("issue2978.START");
    FBTest.openNewTab(basePath + "css/2978/issue2978.html", function(win)
    {
        FBTest.openFirebug(function() {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("myElement", function(sel)
            {
                FBTest.progress("issue2978; Selection:", sel);

                var nodeTag = sel.getElementsByClassName("nodeTag")[0];

                // Reset clipboard content and execute "Copy CSS Path" command.
                FBTest.clearClipboard();
                FBTest.executeContextMenuCommand(nodeTag, "fbCopyCSSPath", function()
                {
                    var expected = "html body div.myClass span#myElement";
                    FBTest.waitForClipboard(expected, function(cssPath)
                    {
                        var cssPath = FBTest.getClipboardText();
                        FBTest.compare(expected, cssPath,
                            "CSS path must be properly copied into the clipboard");
                        FBTest.testDone("issue2978.DONE");
                    });
                });
            });
        });
    });
}
