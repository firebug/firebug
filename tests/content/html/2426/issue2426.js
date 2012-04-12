function runTest()
{
    FBTest.sysout("issue2426.START");
    FBTest.openNewTab(basePath + "html/2426/issue2426.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableNetPanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("html");

            // Search for 'Inspect This Element' within the HTML panel, which
            // automatically expands the tree.
            FBTest.searchInHtmlPanel("Inspect This Element", function(sel)
            {
                FBTest.sysout("issue2426; Selection:", sel);

                var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
                var nodeTag = nodeLabelBox.querySelector(".nodeTag");

                // Reset clipboard content and execute "Copy XPath" command.
                FBTest.clearClipboard();
                FBTest.executeContextMenuCommand(nodeTag, "fbCopyXPath", function()
                {
                    var expectedXPath = "/html/body/soap-env:envelope/soap-env:header/soap-env:body/" +
                        "tns:getresponse/tns:header/header:messageid";
                    FBTest.waitForClipboard(expectedXPath, function(xPath)
                    {
                        FBTest.compare(expectedXPath, xPath,
                            "XPath must be properly copied into the clipboard");
                        FBTest.testDone("issue2426.DONE");
                    });
                });
            })
        });
    });
}
