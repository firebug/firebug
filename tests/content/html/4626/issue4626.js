function runTest()
{
    FBTest.openNewTab(basePath + "html/4626/issue4626.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.searchInHtmlPanel("testFrame", function (sel)
            {
                // Click on the element to make sure it's selected
                var iframeNode = FW.FBL.getAncestorByClass(sel.anchorNode, "containerNodeBox open");
                var docTypeNode = iframeNode.getElementsByClassName("docTypeNodeBox")[0];

                if (FBTest.ok(docTypeNode, "Doctype must exist"))
                {
                    FBTest.compare("<!DOCTYPE html>", docTypeNode.textContent,
                        "Doctype must be correct");
                }

                FBTest.testDone();
            });
        });
    });
}
