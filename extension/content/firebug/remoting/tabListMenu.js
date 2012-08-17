/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/lib/string",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/remoting/tabWatcherProxy",
],
function(FBTrace, Obj, Menu, Str, Events, Dom, TabWatcherProxy) {

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

        // xxxHonza: What about 'onConnect' dispatched by BTI.Browser?
        Firebug.ConnectionMenu.addListener(this);

        this.updateUI();
    },

    shutdown: function()
    {
        Firebug.ConnectionMenu.removeListener(this);

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

        if (!this.tabWatcherProxy)
            return;

        this.tabWatcherProxy.getTabs(function(tabs)
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

        // Hide if not connected.
        if (!this.tabWatcherProxy)
        {
            Dom.collapse(menu, true);
            return;
        }

        Dom.collapse(menu, false);

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

    onConnect: function(connection)
    {
        this.tabWatcherProxy = new TabWatcherProxy(connection);

        this.updateUI();
    },

    onDisconnect: function()
    {
        this.tabWatcherProxy = null;

        this.updateUI();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    selectTab: function(tab)
    {
        this.tabWatcherProxy.onSelectTab(tab);

        Events.dispatch(this.fbListeners, "onSelectTab", [tab]);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.TabListMenu);

return Firebug.TabListMenu;

// ********************************************************************************************* //
});
