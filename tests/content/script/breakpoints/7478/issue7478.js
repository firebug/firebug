function runTest()
{
    var url = basePath + "script/breakpoints/7478/issue7478.html"
    FBTest.openNewTab(url, (win) =>
    {
        FBTest.enableScriptPanel((win) =>
        {
            var LINE_NUMBER = 9;
            var chrome = FW.Firebug.chrome;
            FBTest.selectSourceLine(url, LINE_NUMBER, "js", chrome, (lineNode) =>
            {
                var target = lineNode.getElementsByClassName("firebug-line").item(0);
                FBTest.progress("Waiting for the context menu to show....");
                FBTest.showScriptPanelContextMenu(target, (contextMenu) =>
                {
                    FBTest.progress("The context menu is shown");
                    for (var i = 0; i < contextMenu.children.length; i++)
                    {
                        var menuItem = contextMenu.children[i];
                        if (menuItem.label == 'Edit Breakpoint Condition...')
                        {
                            menuItem.doCommand();
                            FBTest.waitForBreakpoint(url, LINE_NUMBER, () =>
                            {
                                var scriptPanel = FBTest.selectPanel("script");
                                var conditionEditor = scriptPanel.
                                    panelNode.querySelector(".conditionEditor");

                                FBTest.ok(conditionEditor, "The condtion editor should display to the user.");
                                FBTest.testDone();
                            });
                        }
                    }
                });
            });
        });
    });
}
