/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/lib/css",
    "firebug/chrome/menu"
],
function(FBTrace, Locale, Options, Css, Menu) {

// ********************************************************************************************* //
// Constants

var Toolbar = {};

// ********************************************************************************************* //
// Implementation

Toolbar.createToolbarButton = function(toolbar, button, before)
{
    if (typeof(button) == "string" && button.charAt(0) == "-")
        return Toolbar.createToolbarSeparator(toolbar, before);

    var toolbarButton = toolbar.ownerDocument.createElement("toolbarbutton");

    Toolbar.setItemIntoElement(toolbarButton, button);

    if (before)
        toolbar.insertBefore(toolbarButton, before);
    else
        toolbar.appendChild(toolbarButton);

    return toolbarButton;
};

Toolbar.setItemIntoElement = function(element, item)
{
    if (item.label)
    {
        var label = item.nol10n ? item.label : Locale.$STR(item.label);
        element.setAttribute("label", label);
    }

    if (item.id)
        element.setAttribute("id", item.id);

    if (item.type)
        element.setAttribute("type", item.type);

    if (item.checked)
        element.setAttribute("checked", "true");

    if (item.disabled)
        element.setAttribute("disabled", "true");

    if (item.image)
        element.setAttribute("image", item.image);

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

    if (item.key)
        element.setAttribute("accesskey", item.key);

    if (item.name)
        element.setAttribute("name", item.name);

    if (item.items)
        Menu.createMenuPopup(element, item);

    return element;
};

Toolbar.createToolbarSeparator = function(toolbar, before)
{
    if (!toolbar.firstChild)
        return;

    var separator = toolbar.ownerDocument.createElement("toolbarseparator");
    if (before)
        toolbar.insertBefore(separator, before);
    else
        toolbar.appendChild(separator);

    return separator;
};

// ********************************************************************************************* //
// Registration

return Toolbar;

// ********************************************************************************************* //
});
