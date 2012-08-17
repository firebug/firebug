/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/lib/string",
    "firebug/lib/events",
],
function(FBTrace, Obj, Menu, Str, Events) {

// ********************************************************************************************* //
// Module

/**
 * @module This module represents tab-list menu that shows list of tabs from
 * connected remote browser instance.
 */
Firebug.TabListMenu = Obj.extend(Firebug.Module,
/** @lends Firebug.TabListMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.updateUI();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Event Handlers

    onShowing: function(popup)
    {
        // Create temporary menu item.
        Menu.createMenuItem(popup, {
            nol10n: true,
            image: "firebug-loading_16.gif",
            label: "Fetching list of remote tabs...",
            disabled: true,
        });

        var self = this;

        // xxxHonza: TODO: use default (global) proxy
        var proxy = null;
        if (!proxy)
            return;

        proxy.getTabs(function(tabs)
        {
            self.clear(popup);

            // Populate the popup menu with entries (list of tab titles).
            for (var i=0; i<tabs.length; ++i)
            {
                var tab = tabs[i];
                var item = {
                    nol10n: true,
                    label: tab.label,
                    type: "radio",
                    checked: self.currentTab == tab.id,
                    command: self.selectTab.bind(self, tab)
                };
                Menu.createMenuItem(popup, item);
            }
        });

        // Yep, show the menu immediattely. Note that it can be populated asynchronously.
        return true;
    },

    onHidden: function(popup)
    {
        this.clear(popup);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

    updateUI: function()
    {
        var menu = Firebug.chrome.$("firebugTabListMenu");

        var label = "Select Remote Tab";
        var context = Firebug.currentContext;
        var tab = context ? context.tab : null;
        if (tab)
            label = Str.cropString(tab.label, 100);

        menu.setAttribute("label", label + " ");
    },

    clear: function(popup)
    {
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection Listener

    onConnect: function()
    {
        this.updateUI();
    },

    onDisconnect: function()
    {
        this.updateUI();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    selectTab: function(tab)
    {
        Events.dispatch(this.fbListeners, "onSelectTab", [tab]);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.TabListMenu);

return Firebug.TabListMenu;

// ********************************************************************************************* //
});
