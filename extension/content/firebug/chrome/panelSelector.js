/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/xml",
    "firebug/lib/locale",
    "firebug/chrome/menu",
],
function(Firebug, FBTrace, Dom, Xml, Locale, Menu) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_PANELSELECTOR");

// ********************************************************************************************* //
// Implementation

/**
 * @object This object implements 'Panel Selector' feature that allows to show/hide individual
 * Firebug panels as well as selecting them. This feature used to be available on the main
 * Firebug toolbar and has been moved into Firebug menu in 2.0
 *
 * xxxHonza: There is some code related to the logic in binding.xml. It should be moved into
 * this module if possible.
 */
var PanelSelector =
/** @lends PanelSelector */
{
    onMenuShowing: function(popup)
    {
        var items = [];
        var panelBar = Firebug.chrome.getElementById("fbPanelBar1");
        var tab = panelBar.panelTabs.firstChild;

        // Custom initialization of the menu-item element.
        function initializeMenuItem(panelType, element)
        {
            element.panelType = panelType;
        }

        // Create an menu-option-item for every existing panel tab.
        while (tab)
        {
            var panelType = tab.panelType;
            var panelName = panelType.prototype.name;

            items.push(
            {
                label: Firebug.getPanelTitle(panelType),
                tooltiptext: Firebug.getPanelTooltip(panelType),
                type: "checkbox",
                checked: Xml.isVisible(tab),
                className: "panelBarTabListMenuItem",
                command: this.onTogglePanel.bind(this, popup, panelName),
                initialize: initializeMenuItem.bind(this, panelType)
            });

            tab = tab.nextSibling;
        }

        // Create separator
        items.push("-");

        // The last menu item is for opening all panels.
        items.push(
        {
            label: Locale.$STR("firebug.Show_All_Panels"),
            tooltiptext: Firebug.getPanelTooltip(panelType),
            command: this.onShowAllPanels.bind(this)
        });

        Menu.createMenuItems(popup, items);

        this.updateMenuItems(popup);

        return true;
    },

    onMenuHiding: function(popup)
    {
        Dom.eraseNode(popup);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateMenuItems: function(popup)
    {
        var visibleTabs = [];
        var menuItem = popup.firstChild;
        while (menuItem)
        {
            var checked = menuItem.getAttribute("checked") == "true";
            if (checked)
                visibleTabs.push(menuItem);

            menuItem.removeAttribute("disabled");
            menuItem = menuItem.nextSibling;
        }

        // If there is only one panel visible don't allow to close it.
        if (visibleTabs.length == 1)
            visibleTabs[0].setAttribute("disabled", true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    onTogglePanel: function(popup, panelName, event)
    {
        Trace.sysout("panelSelector.onTogglePanel; " + panelName, event);

        var panelBar = Firebug.chrome.getElementById("fbPanelBar1");
        panelBar.selectPanel(panelName);

        // Close the top (original) popup-menu after a panel is selected.
        var topMenuPopup = Dom.getTopAncestorByTagName(popup, "menupopup");
        topMenuPopup.hidePopup();
    },

    onShowAllPanels: function(event)
    {
        Trace.sysout("panelSelector.onShowAllPanels;");

        var panelBar = Firebug.chrome.getElementById("fbPanelBar1");
        panelBar.openAllPanels(event);
    },
};

// ********************************************************************************************* //
// Registration

// Expose for browserOverlay.js
Firebug.PanelSelector = PanelSelector;

return PanelSelector;

// ********************************************************************************************* //
});
