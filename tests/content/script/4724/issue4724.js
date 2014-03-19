function runTest()
{
    var url = basePath + "script/4724/issue4724.html";
    FBTest.openNewTab(url, function(win)
    {
        var line = 8;

        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, url, line, null, function()
            {
                var menuItemLabel = "Set Breakpoint";
                var lineNode = FBTest.getSourceLineNode(line);
                var target = lineNode.getElementsByClassName("firebug-line").item(0);
                FBTest.showScriptPanelContextMenu(target, function(contextMenu)
                {
                    for (var i=0; i<contextMenu.children.length; i++)
                    {
                        var menuItem = contextMenu.children[i];
                        if (menuItem.label == menuItemLabel)
                            break;
                    }

                    FBTest.ok(menuItem, "'" + menuItemLabel  +
                        "' item must be available in the context menu.");

                    if (menuItem)
                    {
                        FBTest.ok(menuItem.getAttribute("checked") == "true",
                            "Menu item must be checked");
                    }

                    FBTest.testDone();
                });
            });
        });
    });
}
