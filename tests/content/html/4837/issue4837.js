function runTest()
{
    FBTest.openNewTab(basePath + "html/4837/issue4837.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                FBTest.waitForHtmlMutation(null, "div", function(node)
                {
                    var nodeText = node.getElementsByClassName("nodeText").item(0);
                    FBTest.compare("Hello Firebug user!", nodeText && nodeText.textContent, "The element's content should be changed.");

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("sayHello"));
            });
        });
    });
}
