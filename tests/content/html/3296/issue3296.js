function runTest()
{
    FBTest.sysout("issue3296.START");

    FBTest.openNewTab(basePath + "html/3296/issue3296.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");
        var actionValue = "issue3296.html";

        FBTest.selectElementInHtmlPanel("formField", function(node)
        {
            FBTest.reload(function()
            {
                var parentElement = FW.FBL.getAncestorByClass(node.parentNode, "nodeBox");
                var attribute = parentElement.getElementsByClassName("nodeAttr").item(0);
                if (FBTest.compare("action",
                    attribute.getElementsByClassName("nodeName").item(0).textContent,
                    "Form tag must contain an 'action' attribute"))
                {
                    FBTest.compare(actionValue,
                        attribute.getElementsByClassName("nodeValue").item(0).textContent,
                        "The value of the 'action' attribute must be '"+actionValue+"'")
                }
                FBTest.testDone("issue3296.DONE");
            });
        });
    });
}
