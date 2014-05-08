function runTest()
{
    FBTest.openNewTab(basePath + "css/4180/issue4180.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.querySelectorAll(".cssPropValue");

                FBTest.compare(
                    "#8c8cff -moz-linear-gradient(135deg, #788cff, #b4c8ff) repeat scroll 0 0",
                    values[0].innerHTML,
                    "The values must be in the order: background-color, background-image, " +
                        "background-repeat, background-attachment, background-position."
                );

                FBTest.testDone();
            });
        });
    });
}