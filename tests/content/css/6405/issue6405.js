function runTest()
{
    FBTest.openNewTab(basePath + "css/6405/issue6405.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue6405.html");

            var tests = [];
            tests.push(testFontFaceRule);
            tests.push(testStyleRule);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}

function testFontFaceRule(callback)
{
    var fontFaceRule = FBTest.getSelectedPanel().panelNode.getElementsByClassName("cssRule")[0];
    checkContextMenuEntry(fontFaceRule, false);

    callback();
}

function testStyleRule(callback)
{
    var styleRule = FBTest.getSelectedPanel().panelNode.getElementsByClassName("cssRule")[1];
    checkContextMenuEntry(styleRule, true);

    callback();
}

function checkContextMenuEntry(target, entryMustExist, callback)
{
    var menuItemIdentifier = "fbGetMatchingElements";
    var contextMenu = ContextMenuController.getContextMenu(target);

    function onPopupShown(event)
    {
        ContextMenuController.removeListener(target, "popupshown", onPopupShown);

        // Fire the event handler asynchronously so items have a chance to be appended.
        setTimeout(function()
        {
            var menuItem = contextMenu.ownerDocument.getElementById(menuItemIdentifier);

            FBTest.ok((entryMustExist && menuItem) || (!entryMustExist && !menuItem),
                "'" + menuItemIdentifier + "' item must " + (entryMustExist ? "" : "not ") +
                "be available in the context menu.");

            // Make sure the context menu is closed.
            contextMenu.hidePopup();
        }, 10);
    }

    // Wait till the menu is displayed.
    ContextMenuController.addListener(target, "popupshown", onPopupShown);

    // Right click on the target element.
    var eventDetails = {type: "contextmenu", button: 2};
    FBTest.synthesizeMouse(target, 2, 2, eventDetails);
}