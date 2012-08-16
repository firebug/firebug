/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/menu",
    "httpmonitor/lib/string",
    "httpmonitor/lib/events",
    "httpmonitor/base/module",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Obj, Menu, Str, Events, Module, Chrome) {

// ********************************************************************************************* //
// Module

/**
 * @module
 */
var TabListMenu = Obj.extend(Module,
/** @lends TabListMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        this.updateUI();
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Event Handlers

    onShowing: function(popup)
    {
        // Create temporary menu item.
        Menu.createMenuItem(popup, {
            nol10n: true,
            image: Chrome.config.skinBaseUrl + "netmonitor-loading_16.gif",
            label: "Fetching list of remote tabs...",
            disabled: true,
        });

        var self = this;

        // Context is not available at this moment, it's going to be created
        // by selecting a tab through this menu so, use the proxy from global
        // HttpMonitor (application) object.
        // xxxHonza: it's hacky to use 'top', but how to access the proxy?
        var proxy = top.HttpMonitor.proxy;

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
        var menu = Chrome.$("httpMonitorTabListMenu");

        var label = "Select Tab";
        var context = Chrome.currentContext;
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

Chrome.registerModule(TabListMenu);

return TabListMenu;

// ********************************************************************************************* //
});
