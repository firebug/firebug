function runTest()
{
    FBTest.sysout("issue4724.START");

    FBTest.openNewTab(basePath + "script/4724/issue4724.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("script");
        var line = 8;

        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, "issue4724.html", line, null, function()
            {
                var contextMenu = FW.FBL.$("fbContextMenu");
                var menuItemLabel = "Set Breakpoint";

                function onPopupShown(event)
                {
                    contextMenu.removeEventListener("popupshown", onPopupShown, false);

                    // Fire the event handler asynchronously so items have a chance to be appended.
                    setTimeout(function()
                    {
                        var menuItem;
                        for each (menuItem in contextMenu.children)
                        {
                            if (menuItem.label == menuItemLabel)
                                break;
                        }

                        FBTest.ok(menuItem, "'" + menuItemLabel  + "' item must be available in the context menu.");

                        // If the menu item isn't available close the context menu and bail out.
                        if (!menuItem)
                        {
                            contextMenu.hidePopup();
                            return;
                        }

                        FBTest.ok(menuItem.getAttribute("checked") == "true", "Menu item must be checked");

                        FBTest.testDone("issue4724.DONE");
                    }, 10);
                }

                // Wait till the menu is displayed.
                contextMenu.addEventListener("popupshown", onPopupShown, false);

                // Right click on line 8
                var lineNode = FBTest.getSourceLineNode(line).getElementsByClassName("sourceRowText").item(0);
                var eventDetails = {type: "contextmenu", button: 2};
                FBTest.synthesizeMouse(lineNode, 2, 2, eventDetails);
            });
        });
    });
}
