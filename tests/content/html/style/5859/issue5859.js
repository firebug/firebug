function runTest()
{
    FBTest.openNewTab(basePath + "html/style/5859/issue5859.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("css");

            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                var selector = panel.panelNode.getElementsByClassName("cssSelector")[0];

                FBTest.executeContextMenuCommand(selector, "fbDeleteRuleDeclaration",
                    function()
                {
                    var selector = panel.panelNode.getElementsByClassName("cssSelector")[0];
                    FBTest.ok(selector.textContent !== "element.style", "'element.style' rule must be removed");

                    var element = win.document.getElementById("element");
                    var cs = win.getComputedStyle(element);
                    FBTest.compare("rgb(0, 0, 0)", cs.color, "Element display must be correct");

                    FBTest.testDone();
                });
            });
        });
    });
}
