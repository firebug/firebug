/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/locale",
    "fbtrace/lib/options",
    "fbtrace/lib/css",
],
function(FBTrace, Locale, Options, Css) {

// ********************************************************************************************* //
// Constants

var Menu = {};

// ********************************************************************************************* //

Menu.createMenu = function(popup, item)
{
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
        Menu.createMenuItem(popup, items[i], before);
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

    if (item.checked)
        element.setAttribute("checked", "true");

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
    if (!popup.firstChild)
        return;

    if (FBTrace.DBG_MENU)
        FBTrace.sysout("createMenuSeparator", {popup: popup, item: item, before: before});

    var menuItem = popup.ownerDocument.createElement("menuseparator");
    if (typeof item == "object" && item.id)
        menuItem.setAttribute("id", item.id);

    if (before)
        popup.insertBefore(menuItem, before);
    else
        popup.appendChild(menuItem);

    return menuItem;
};

Menu.optionMenu = function(label, option, tooltiptext)
{
    return {
        label: label,
        type: "checkbox",
        checked: Firebug[option],
        option: option,
        tooltiptext: tooltiptext,
        command: function() {
            return Options.togglePref(option);
        }
    };
};

// ********************************************************************************************* //
// Registration

return Menu;

// ********************************************************************************************* //
});
