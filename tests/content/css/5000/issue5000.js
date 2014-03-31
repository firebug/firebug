function runTest()
{
    FBTest.openNewTab(basePath + "css/5000/issue5000.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");
            var id = "element1";

            FBTest.selectPanelLocationByName(panel, "issue5000.html");

            FBTest.searchInCssPanel("#" + id, function(node)
            {
                var elementDisplayBefore = FBTest.getImageDataFromNode(win.document.getElementById(id));
                FBTest.executeContextMenuCommand(node, "fbDeleteRuleDeclaration", function()
                {
                    var selectors = panel.panelNode.getElementsByClassName("cssSelector");
                    var ruleDeleted = true;

                    for (var i=0; ruleDeleted && i<selectors.length; i++)
                    {
                        if (selectors[i] == "#" + id)
                            ruleDeleted = false;
                    }

                    FBTest.ok(ruleDeleted, "The rule '#" + id + "' should be deleted");

                    var elementDisplayNow = FBTest.getImageDataFromNode(win.document.getElementById(id));
                    FBTest.ok(elementDisplayBefore != elementDisplayNow, "The styles of the deleted rule shouldn't affect the element anymore");

                    FBTest.testDone();
                });
            });
        });
    });
}
