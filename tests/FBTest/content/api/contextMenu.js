/* See license.txt for terms of usage */

/**
 * This file defines Context Menu APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Context Menu API

/**
 * Opens context menu for target element and executes specified command.
 * Context menu listener is registered through ContextMenuController object, which ensures
 * that the listener is removed at the end of the test even in cases where the context menu
 * is never opened and so, the listener not removed by the test itself.
 *
 * @param {Element} target Element, which's context menu should be opened
 * @param {String or Object} menuItemIdentifier ID or object holding the label of the
 *      menu item, that should be executed
 * @param {Function} callback Function called as soon as the element is selected.
 */
this.executeContextMenuCommand = function(target, menuItemIdentifier, callback)
{
    var contextMenu = ContextMenuController.getContextMenu(target);

    var self = this;

    function onPopupShown(event)
    {
        ContextMenuController.removeListener(target, "popupshown", onPopupShown);

        // Fire the event handler asynchronously so items have a chance to be appended.
        setTimeout(function()
        {
            var menuItem;
            if (typeof menuItemIdentifier == "string" || menuItemIdentifier.id)
            {
                var menuItemId = menuItemIdentifier.id || menuItemIdentifier;
                menuItem = contextMenu.ownerDocument.getElementById(menuItemId);
            }
            else if (menuItemIdentifier.label)
            {
                var menuItemId = menuItemIdentifier.label;
                for (var item = contextMenu.firstChild; item; item = item.nextSibling)
                {
                    if (item.label == menuItemId)
                    {
                        menuItem = item;
                        break;
                    }
                }
            }

            self.ok(menuItem, "'" + menuItemId + "' item must be available in the context menu.");

            // If the menu item isn't available close the context menu and bail out.
            if (!menuItem)
            {
                contextMenu.hidePopup();
                return;
            }

            var submenupopup = FW.FBL.getAncestorByTagName(menuItem, "menupopup");
            // if the item appears in a sub-menu:
            if (submenupopup && submenupopup.parentNode.tagName === "menu")
            {
                var isParentEnabled = submenupopup.parentNode.disabled === false;
                self.ok(isParentEnabled, "the parent \""+submenupopup.parentNode.label+
                    "\" of the sub-menu must be enabled");
                if (!isParentEnabled)
                {
                    contextMenu.hidePopup();
                    return;
                }
                submenupopup.showPopup();
            }

            // Click on specified menu item.
            self.synthesizeMouse(menuItem);

            // Make sure the context menu is closed.
            contextMenu.hidePopup();

            if (callback)
            {
                // Since the command is dispatched asynchronously,
                // execute the callback using timeout.
                // Especially Mac OS needs this.
                setTimeout(function()
                {
                    callback();
                }, 250);
            }
        }, 10);
    }

    // Wait till the menu is displayed.
    ContextMenuController.addListener(target, "popupshown", onPopupShown);

    // Right click on the target element.
    var eventDetails = {type: "contextmenu", button: 2};
    this.synthesizeMouse(target, 2, 2, eventDetails);
};

// ********************************************************************************************* //
}).apply(FBTest);
