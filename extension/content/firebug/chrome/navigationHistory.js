/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/lib/events",
    "firebug/chrome/module",
    "firebug/chrome/menu",
],
function(Firebug, FBTrace, Obj, Locale, Dom, Events, Module, Menu) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var MAX_HISTORY_MENU_ITEMS = 15;

// Standard tracing output
var Trace = FBTrace.to("DBG_HISTORY");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //

/**
 * @module Support for back and forward navigation within Firebug UI. The logic allows to
 * go back over selected (main) panels history as well as over location changes in a panel.
 * The UI is composed from two buttons back and forward, which are presented in the main
 * Firebug toolbar.
 *
 * In order to record the history of selected panels and locations, there are two
 * events handled:
 *
 * 1) selectPanel: fired when a panel is selected
 * 2) navigate: executed when panel navigation happens
 */
var NavigationHistory = Obj.extend(Module,
/** @lends NavigationHistory */
{
    dispatchName: "navigationHistory",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        this.onSelectPanel = this.onSelectPanel.bind(this);

        var panelBar = getPanelBar();
        Events.addEventListener(panelBar, "selectPanel", this.onSelectPanel, false);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        var panelBar = getPanelBar();
        Events.removeEventListener(panelBar, "selectPanel", this.onSelectPanel, false);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context, persistedState)
    {
        Module.initContext.apply(this, arguments);

        // Initialize context members. The history is stored within
        // the current context (document).
        context.navigationHistory = [];
        context.navigationHistoryIndex = 0;

        if (persistedState && persistedState.navigationHistory)
        {
            context.navigationHistory = persistedState.navigationHistory;
            context.navigationHistoryIndex = persistedState.navigationHistoryIndex;
        }
    },

    destroyContext: function(context, persistedState)
    {
        Module.destroyContext.apply(this, arguments);

        if (persistedState)
        {
            persistedState.navigationHistory = context.navigationHistory;
            persistedState.navigationHistoryIndex = context.navigationHistoryIndex;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // History popup menu

    onPopupShowing: function(popup, context)
    {
        var currIndex = this.getCurrentIndex(context);

        Trace.sysout("navigationHistory.onPopupShowing; " + currIndex + ", " +
            context.getName(), context);

        Dom.eraseNode(popup);

        var list = this.getHistory(context);

        // Don't display the popup for a single item.
        var count = list.length;
        if (count <= 1)
            return false;

        var maxItems = MAX_HISTORY_MENU_ITEMS;
        var half = Math.floor(maxItems / 2);
        var start = Math.max(currIndex - half, 0);
        var end = Math.min(start == 0 ? maxItems : currIndex + half + 1, count);

        if (end == count)
            start = Math.max(count - maxItems, 0);

        var tooltipBack = Locale.$STR("firebug.history.Go back to this panel");
        var tooltipCurrent = Locale.$STR("firebug.history.Stay on this panel");
        var tooltipForward = Locale.$STR("firebug.history.Go forward to this panel");

        for (var i = end - 1; i >= start; i--)
        {
            var historyItem = list[i];
            var panelType = Firebug.getPanelType(historyItem.panelName);
            var label = Firebug.getPanelTitle(panelType);

            if (historyItem.location && historyItem.location.url)
                label += " - " + historyItem.location.url;

            var menuInfo = {
                label: label,
                nol10n: true,
                className: "menuitem-iconic fbURLMenuItem",
            };

            if (i < currIndex)
            {
                menuInfo.className += " navigationHistoryMenuItemBack";
                menuInfo.tooltiptext = tooltipBack;
            }
            else if (i == currIndex)
            {
                menuInfo.type = "radio";
                menuInfo.checked = "true";
                menuInfo.className = "navigationHistoryMenuItemCurrent";
                menuInfo.tooltiptext = tooltipCurrent;
            }
            else
            {
                menuInfo.className += " navigationHistoryMenuItemForward";
                menuInfo.tooltiptext = tooltipForward;
            }

            var menuItem = Menu.createMenuItem(popup, menuInfo);
            menuItem.repObject = location;
            menuItem.setAttribute("index", i);
        }

        return true;
    },

    onHistoryCommand: function(event, context)
    {
        var menuItem = event.target;
        var index = menuItem.getAttribute("index");
        if (!index)
            return false;

        this.gotoHistoryIndex(context, index);
        return true;
    },

    goBack: function(context)
    {
        var currIndex = this.getCurrentIndex(context);

        Trace.sysout("navigationHistory.goBack; " + currIndex + ", " +
            context.getName(), context);

        this.gotoHistoryIndex(context, currIndex - 1);
    },

    goForward: function(context)
    {
        var currIndex = this.getCurrentIndex(context);

        Trace.sysout("navigationHistory.goForward; " + currIndex + ", " +
            context.getName(), context);

        this.gotoHistoryIndex(context, currIndex + 1);
    },

    gotoHistoryIndex: function(context, index)
    {
        var list = this.getHistory(context);
        if (index < 0 || index >= list.length)
            return;

        var historyItem = list[index];

        try
        {
            this.navInProgress = true;
            Firebug.chrome.navigate(historyItem.location, historyItem.panelName);
            context.navigationHistoryIndex = index;
        }
        catch (e)
        {
        }
        finally
        {
            this.navInProgress = false;
        }

        this.updateButtons(context);
    },


    updateButtons: function(context)
    {
        var list = this.getHistory(context);

        var backButton = Firebug.chrome.$("fbNavigateBackButton");
        var forwardButton = Firebug.chrome.$("fbNavigateForwardButton");

        backButton.setAttribute("disabled", "true");
        forwardButton.setAttribute("disabled", "true");

        if (list.length <= 1)
            return;

        var currIndex = this.getCurrentIndex(context);

        if (currIndex > 0)
            backButton.removeAttribute("disabled");

        if (currIndex < list.length-1)
            forwardButton.removeAttribute("disabled");
    },

    getHistory: function(context)
    {
        if (!context.navigationHistory)
            context.navigationHistory = [];

        return context.navigationHistory;
    },

    getCurrentIndex: function(context)
    {
        if (typeof(context.navigationHistoryIndex) == "undefined")
            context.navigationHistoryIndex = 0;

        return context.navigationHistoryIndex;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    onPanelNavigate: function(location, panel, panelName)
    {
        // The "panel" argument can be null in case of disabled panel.
        var panelName = (panel ? panel.name : panelName);
        if (!panelName)
        {
            TraceError.sysout("navigationHistory.onPanelNavigate; ERROR no panel name!");
            return;
        }

        var url = (location ? location.href : "No Location");
        var context = panel ? panel.context : Firebug.currentContext;
        if (!context)
            return;

        var currIndex = this.getCurrentIndex(context);
        var list = this.getHistory(context);

        // Ignore side panel navigation.
        if (panel && panel.parentPanel)
        {
            Trace.sysout("navigationHistory.onPanelNavigate; ignore side panels");
            return;
        }

        // The user is navigating using the history UI, this action doesn't affect
        // the history list.
        if (this.navInProgress)
        {
            Trace.sysout("navigationHistory.onPanelNavigate; navigation in progress");
            return;
        }

        // If the last item in the history is the same bail out.
        var lastHistoryItem = list.length ? list[list.length-1] : null;
        if (lastHistoryItem && lastHistoryItem.panelName == panelName &&
            lastHistoryItem.location == location)
        {
            Trace.sysout("navigationHistory.onPanelNavigate; ignore the same navigations", {
                lastHistoryItem: lastHistoryItem,
                panelName: panelName,
                location: location,
            });

            return;
        }

        // If the panel is the same, bail out.
        var currHistoryItem = list.length ? list[currIndex] : null;
        if (currHistoryItem && currHistoryItem.panelName == panelName &&
            currHistoryItem.location == location)
        {
            Trace.sysout("navigationHistory.onPanelNavigate; ignore the same panel navigation");
            return;
        }

        // Remove forward history.
        list.splice(currIndex + 1, list.length - (currIndex + 1));

        // New history record.
        list.push({panelName: panelName, location: location});
        context.navigationHistoryIndex = list.length - 1;

        Trace.sysout("navigationHistory.onPanelNavigate; New record created, total: " +
            list.length + ", " + panelName + ", " + (location ? location.url : "No Location"),
            list);

        // Update back and forward buttons in the UI.
        this.updateButtons(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Chrome Listener

    onSelectPanel: function(event)
    {
        var panelBar = getPanelBar();

        var panel = panelBar.selectedPanel;
        var tab = panelBar.selectedTab;
        if (!tab)
            return;

        var panelName = tab.panelType.prototype.name;
        var location = panel ? panel.location : null;

        Trace.sysout("navigationHistory.onSelectPanel; name: " +
            (panel ? panel.name : "unknown panel") + ", location: " +
            (panel ? panel.location : "unknown location") + ", tab name: " +
            (tab ? tab.panelType.prototype.name : "unknown tab name"));

        this.onPanelNavigate(location, panel, panelName);
    },
});

// ********************************************************************************************* //
// Private Local Helpers

function getPanelBar()
{
    return Firebug.chrome.getElementById("fbPanelBar1");
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(NavigationHistory);
Firebug.registerUIListener(NavigationHistory);

// Expose for XUL UI
Firebug.NavigationHistory = NavigationHistory;

return NavigationHistory;

// ********************************************************************************************* //
});
