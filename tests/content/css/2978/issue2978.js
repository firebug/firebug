function runTest()
{
    FBTest.sysout("issue2978.START");
    FBTest.openNewTab(basePath + "css/2978/issue2978.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("html");

        // Search for 'myElement' within the HTML panel, which
        // automatically expands the tree.
        FBTest.searchInHtmlPanel("myElement", function(sel)
        {
            FBTest.progress("before0");
            FBTest.sysout("issue2978; Selection:", sel);

            var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
            var nodeTag = nodeLabelBox.querySelector(".nodeTag");

            FBTest.progress("before");

            // Reset clipboard content and execute "Copy CSS Path" command.
            FBTest.clearClipboard();
            FBTest.executeContextMenuCommand(nodeTag, "fbCopyCSSPath", function()
            {
                FBTest.progress("adf");
                var expected = "html body div.myClass span#myElement";
                FBTest.waitForClipboard(expected, function(cssPath)
                {
                    var cssPath = FBTest.getClipboardText();
                    FBTest.compare(expected, cssPath,
                        "CSS path must be properly copied into the clipboard");
                    FBTest.testDone("issue2978.DONE");
                });
            });
        })
    });
}
