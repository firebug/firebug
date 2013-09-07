/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/firebug",
    "firebug/lib/dom",
    "firebug/chrome/menu",
],
function(Obj, Locale, Firebug, Dom, Menu) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const MAX_HISTORY_MENU_ITEMS = 15;

// ********************************************************************************************* //

/**
 * @class Support for back and forward pattern for navigating within Firebug UI (panels).
 */
Firebug.NavigationHistory = Obj.extend(Firebug.Module,
{
    dispatchName: "navigationHistory",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Extending Module

    initContext: function(context, persistedState)
    {
        Firebug.Module.initContext.apply(this, arguments);

        // Initialize context members.
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
        Firebug.Module.destroyContext.apply(this, arguments);

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

        if (FBTrace.DBG_HISTORY)
        {
            FBTrace.sysout("history.onPopupShowing; " + currIndex + ", " +
                context.getName(), context);
        }

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

        for (var i=end-1; i>=start; i--)
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

        if (FBTrace.DBG_HISTORY)
            FBTrace.sysout("history.goBack; " + currIndex + ", " + context.getName(), context);

        this.gotoHistoryIndex(context, currIndex - 1);
    },

    goForward: function(context)
    {
        var currIndex = this.getCurrentIndex(context);

        if (FBTrace.DBG_HISTORY)
            FBTrace.sysout("history.goForward; " + currIndex + ", " + context.getName(), context);

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

    onPanelNavigate: function(location, panel)
    {
        var context = panel.context;
        var currIndex = this.getCurrentIndex(context);

        if (FBTrace.DBG_HISTORY)
            FBTrace.sysout("history.onPanelNavigate; " + currIndex + ", " +
                "Panel: " + (panel ? panel.name : "Unknown Panel") + ", " +
                "Location: " + (location ? location.url : "No Location") + ", " +
                context.getName());

        // The panel must be always there
        if (!panel)
            return;

        // Ignore side panel navigation.
        if (panel.parentPanel)
            return;

        // The user is navigating using the history UI, this action doesn't affect
        // the history list.
        if (this.navInProgress)
            return;

        var list = this.getHistory(context);

        // If the last item in the history is the same bail out.
        var lastHistoryItem = list.length ? list[list.length-1] : null;
        if (lastHistoryItem && lastHistoryItem.panelName == panel.name &&
            lastHistoryItem.location == location)
            return;

        if (lastHistoryItem && lastHistoryItem.location && location &&
            lastHistoryItem.location.url == location.url)
            return;

        // If the panel is the same, bail out.
        var currHistoryItem = list.length ? list[currIndex] : null;
        if (currHistoryItem && currHistoryItem.panelName == panel.name &&
            currHistoryItem.location == location)
            return;

        // Remove forward history.
        list.splice(currIndex+1, list.length-(currIndex+1));

        // New back history record.
        list.push({panelName: panel.name, location: location});
        context.navigationHistoryIndex = list.length-1;

        if (FBTrace.DBG_HISTORY)
            FBTrace.sysout("history.onPanelNavigate; New history record created " + currIndex +
                ", " + panel.name + ", " + (location ? location.url : "No Location"), list);

        // Update back and forward buttons in the UI.
        this.updateButtons(context);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.NavigationHistory);
Firebug.registerUIListener(Firebug.NavigationHistory);

return Firebug.NavigationHistory;

// ********************************************************************************************* //
});
