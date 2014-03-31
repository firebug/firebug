function runTest()
{
    FBTest.openNewTab(basePath + "html/2426/issue2426.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                FBTest.selectPanel("html");

                // Search for 'Inspect This Element' within the HTML panel, which
                // automatically expands the tree.
                FBTest.searchInHtmlPanel("Inspect This Element", function(sel)
                {
                    FBTest.sysout("issue2426; Selection:", sel);

                    var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
                    var nodeTag = nodeLabelBox.querySelector(".nodeTag");

                    function executeContextMenuCommand()
                    {
                        FBTest.executeContextMenuCommand(nodeTag, "fbCopyXPath");
                    }

                    var expectedXPath = "/html/body/soap-env:envelope/soap-env:header/soap-env:body/" +
                        "tns:getresponse/tns:header/header:messageid";
                    FBTest.waitForClipboard(expectedXPath, executeContextMenuCommand, function(xPath)
                    {
                        FBTest.compare(expectedXPath, xPath,
                            "XPath must be properly copied into the clipboard");
                        FBTest.testDone();
                    });
                })
            });
        });
    });
}
