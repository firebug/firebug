/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/lib/css",
],
function(FBTrace, Locale, Options, Css) {

// ********************************************************************************************* //
// Constants

var Menu = {};

// ********************************************************************************************* //

Menu.createMenu = function(popup, label)
{
    var menu = popup.ownerDocument.createElement("menu");
    menu.setAttribute("label", label);

    var menuPopup = popup.ownerDocument.createElement("menupopup");

    popup.appendChild(menu);
    menu.appendChild(menuPopup);

    return menuPopup;
};

Menu.createMenuItem = function(popup, item, before)
{
    if (typeof(item) == "string" && item.indexOf("-") == 0)
        return Menu.createMenuSeparator(popup, before);

    var menuitem = popup.ownerDocument.createElement("menuitem");

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

    return element;
}

Menu.createMenuHeader = function(popup, item)
{
    var header = popup.ownerDocument.createElement("label");
    header.setAttribute("class", "menuHeader");

    var label = item.nol10n ? item.label : Locale.$STR(item.label);

    header.setAttribute("value", label);

    popup.appendChild(header);
    return header;
};

Menu.createMenuSeparator = function(popup, before)
{
    if (!popup.firstChild)
        return;

    var menuitem = popup.ownerDocument.createElement("menuseparator");
    if (before)
        popup.insertBefore(menuitem, before);
    else
        popup.appendChild(menuitem);
    return menuitem;
};

/**
 * Create an option menu item definition. This method is usually used in methods like:
 * {@link Firebug.Panel.getOptionsMenuItems} or {@link Firebug.Panel.getContextMenuItems}.
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
        checked: Firebug[option],
        option: option,
        tooltiptext: tooltiptext,
        command: function() {
            return Options.set(option, !Firebug[option]);
        }
    };
};

// ********************************************************************************************* //
// Registration

return Menu;

// ********************************************************************************************* //
});
