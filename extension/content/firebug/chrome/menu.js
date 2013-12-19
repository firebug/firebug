/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/lib/css",
    "firebug/lib/deprecated",
    "firebug/lib/system",
],
function(FBTrace, Locale, Options, Css, Deprecated, System) {

"use strict";

// ********************************************************************************************* //
// Constants

var Menu = {};

// ********************************************************************************************* //

Menu.createMenu = function(popup, item)
{
    if (typeof item == "string")
    {
        return Deprecated.method("The function's header changed to " +
            "createMenu(popup, item)",
            Menu.createMenu, [popup, {label: item}])();
    }

    var menu = popup.ownerDocument.createElement("menu");
    popup.appendChild(menu);

    Menu.setItemIntoElement(menu, item);

    this.createMenuPopup(menu, item);

    return menu;
};

Menu.createMenuPopup = function(parent, item)
{
    var menuPopup = parent.ownerDocument.createElement("menupopup");
    parent.appendChild(menuPopup);

    if (item.items)
    {
        for (var i = 0, len = item.items.length; i < len; ++i)
            Menu.createMenuItem(menuPopup, item.items[i]);
    }

    return menuPopup;
}

// Menu.createMenuItems(popup, items[, before])
Menu.createMenuItems = function(popup, items, before)
{
    for (var i=0; i<items.length; i++)
    {
        var item = items[i];

        // Override existing items to avoid duplicates.
        var existingItem = popup.querySelector("#" + item.id);
        if (existingItem)
        {
            Menu.createMenuItem(popup, item, existingItem);
            popup.removeChild(existingItem);
            continue;
        }

        Menu.createMenuItem(popup, item, before);
    }
};

Menu.createMenuItem = function(popup, item, before)
{
    if ((typeof(item) == "string" && item == "-") || item.label == "-")
        return Menu.createMenuSeparator(popup, item, before);

    var menuitem;

    if (item.items)
        menuitem = Menu.createMenu(popup, item);
    else
        menuitem = popup.ownerDocument.createElement("menuitem");

    Menu.setItemIntoElement(menuitem, item);

    if (before)
        popup.insertBefore(menuitem, before);
    else
        popup.appendChild(menuitem);

    return menuitem;
};

Menu.setItemIntoElement = function(element, item)
{
    var label = item.nol10n ? item.label : Locale.$STR(item.label);

    element.setAttribute("label", label);

    if (item.id)
        element.setAttribute("id", item.id);

    if (item.type)
        element.setAttribute("type", item.type);

    // Avoid closing the popup menu if a preference has been changed.
    // This allows to quickly change more options.
    if (item.type == "checkbox" && !item.closemenu)
        element.setAttribute("closemenu", "none");

    if (item.disabled)
        element.setAttribute("disabled", "true");

    if (item.image)
    {
        element.setAttribute("class", "menuitem-iconic");
        element.setAttribute("image", item.image);
    }

    if (item.command)
        element.addEventListener("command", item.command, false);

    if (item.commandID)
        element.setAttribute("command", item.commandID);

    if (item.option)
        element.setAttribute("option", item.option);

    if (item.tooltiptext)
    {
        var tooltiptext = item.nol10n ? item.tooltiptext : Locale.$STR(item.tooltiptext);
        element.setAttribute("tooltiptext", tooltiptext);
    }

    if (item.className)
        Css.setClass(element, item.className);

    if (item.acceltext)
        element.setAttribute("acceltext", item.acceltext);
    else if (item.key)
        element.setAttribute("key", item.key);

    if (item.name)
        element.setAttribute("name", item.name);

    if (item.checked)
        element.setAttribute("checked", "true");

    // Allows to perform additional custom initialization of the menu-item.
    if (item.initialize)
        item.initialize(element);

    return element;
};

Menu.createMenuHeader = function(popup, item)
{
    var header = popup.ownerDocument.createElement("label");
    header.setAttribute("class", "menuHeader");

    var label = item.nol10n ? item.label : Locale.$STR(item.label);

    header.setAttribute("value", label);

    popup.appendChild(header);
    return header;
};

Menu.createMenuSeparator = function(popup, item, before)
{
    if (item instanceof Node)
    {
        return Deprecated.method("The function's header changed to "+
            "createMenuSeparator(popup, item, before)",
            Menu.createMenuSeparator, [popup, null, before])();
    }

    if (!popup.firstChild)
        return;

    var menuItem = popup.ownerDocument.createElement("menuseparator");
    if (typeof item == "object" && item.id)
        menuItem.setAttribute("id", item.id);

    if (before)
        popup.insertBefore(menuItem, before);
    else
        popup.appendChild(menuItem);

    return menuItem;
};

/**
 * Create an option menu item definition. This method is usually used in methods like:
 * {@link Panel.getOptionsMenuItems} or {@link Panel.getContextMenuItems}.
 *
 * @param {String} label Name of the string from *.properties file.
 * @param {String} option Name of the associated option.
 * @param {String, Optional} tooltiptext Optional name of the string from *.properties file
 *      that should be used as a tooltip for the menu.
 */
Menu.optionMenu = function(label, option, tooltiptext)
{
    return {
        label: label,
        type: "checkbox",
        checked: Options.get(option),
        option: option,
        tooltiptext: tooltiptext,
        command: function() {
            return Options.togglePref(option);
        }
    };
};

/**
 * Remove unnecessary separators (at the top or at the bottom of the menu).
 */
Menu.optimizeSeparators = function(popup)
{
    while (popup.firstChild && popup.firstChild.tagName == "menuseparator")
        popup.removeChild(popup.firstChild);

    while (popup.lastChild && popup.lastChild.tagName == "menuseparator")
        popup.removeChild(popup.lastChild);

    // xxxHonza: We should also check double-separators
};

// ********************************************************************************************* //
// Registration

return Menu;

// ********************************************************************************************* //
});
