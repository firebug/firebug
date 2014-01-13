/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/xml",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/chrome/menu",
    "firebug/chrome/module",
],
function(Firebug, FBTrace, Obj, Dom, Xml, Locale, Events, Options, Menu, Module) {

"use strict";

// ********************************************************************************************* //
// Constants

// Tracing
var Trace = FBTrace.to("DBG_PANELSELECTOR");
var TraceError = FBTrace.toError();

// The option has been renamed in Firebug 2.0 to force all panels to be displayed.
// This is because the panel selector menu has been moved into Firebug menu and
// some users could be confused by that change (not being able to get back hidden panels).
// (see also issue 7046).
var hiddenPanels = "hiddenPanels2";

// ********************************************************************************************* //
// Implementation

/**
 * @module This object implements 'Panel Selector' feature that allows to show/hide individual
 * Firebug panels. This feature used to be available on the main Firebug toolbar and has
 * been moved into Firebug menu in 2.0
 */
var PanelSelector = Obj.extend(Module,
/** @lends PanelSelector */
{
    dispatchName: "PanelSelector",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Menu

    onMenuShowing: function(popup)
    {
        var items = [];
        var panelBar = this.getPanelBar();
        var tab = panelBar.panelTabs.firstChild;

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
                command: this.onTogglePanel.bind(this, popup, panelName),
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
        Events.cancelEvent(event);

        var menuItem = event.target;
        var panelBar = this.getPanelBar();

        // The last visible panel can't be hidden.
        if (menuItem.getAttribute("disabled") == "true")
            return;

        // Toggle panel visibility
        menuItem.checked = !menuItem.checked;
        this.togglePanel(panelName, !menuItem.checked);

        Trace.sysout("panelSelector.onTogglePanel; " + panelName + ", visible now: " +
            menuItem.checked, event);

        // If there is only one visible panel now, make sure it's disabled.
        // (the user can't hide all panels).
        this.updateMenuItems(popup);
    },

    onShowAllPanels: function(event)
    {
        Events.cancelEvent(event);

        Trace.sysout("panelSelector.onShowAllPanels;", event);

        var panelBar = this.getPanelBar();

        var tab = panelBar.panelTabs.firstChild;
        while (tab)
        {
            if (!Xml.isVisible(tab))
                Dom.collapse(tab, false);

            tab = tab.nextSibling;
        }

        Options.set(hiddenPanels, "");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Implementation

    closePanel: function(panelName)
    {
        var panelBar = this.getPanelBar();

        var tab = panelBar.getTab(panelName);
        Dom.collapse(tab, true);

        this.storeHiddenPanels();

        if (panelBar.selectedTab != tab)
            return;

        // If the selected panel has been closed, select the first one that is visible.
        tab = panelBar.panelTabs.firstChild;
        while (tab)
        {
            if (Xml.isVisible(tab))
            {
                panelBar.selectTab(tab);
                break;
            }
            tab = tab.nextSibling;
        }
    },

    openPanel: function(panelName)
    {
        var panelBar = this.getPanelBar();

        var tab = panelBar.getTab(panelName);
        Dom.collapse(tab, false);

        this.storeHiddenPanels();
    },

    togglePanel: function(panelName, forceOpen)
    {
        var panelBar = this.getPanelBar();

        var tab = panelBar.getTab(panelName);
        if (!tab)
            return;

        var open = Xml.isVisible(tab);
        if (open && forceOpen)
            return;

        if (open)
            this.closePanel(panelName);
        else
            this.openPanel(panelName);
    },

    storeHiddenPanels: function()
    {
        var panelBar = this.getPanelBar();

        var closedPanels = [];
        var tab = panelBar.panelTabs.firstChild;
        while (tab)
        {
            if (!Xml.isVisible(tab))
                closedPanels.push(tab.panelType.prototype.name);

            tab = tab.nextSibling;
        }

        Options.set(hiddenPanels, closedPanels.join(" "));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    /**
     * Sent by the framework (bindings.xml) when panel tabs are updated.
     */
    updatePanels: function(panelTypes)
    {
        var panelBar = this.getPanelBar();

        // Make sure hidden panels are collapsed.
        var value = Options.get(hiddenPanels);
        if (!value || !value.length)
            return;

        var closedPanels = value.split(" ");
        for (var i = 0; i < closedPanels.length; i++)
        {
            var tab = panelBar.tabMap[closedPanels[i]];
            if (tab)
                Dom.collapse(tab, true);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    getPanelBar: function()
    {
        return Firebug.chrome.getElementById("fbPanelBar1");
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(PanelSelector);

// Expose for browserOverlay.js
Firebug.PanelSelector = PanelSelector;

return PanelSelector;

// ********************************************************************************************* //
});
