/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const MAX_HISTORY_MENU_ITEMS = 15;

// ************************************************************************************************

/**
 * @class Support for back and forward pattern for navigatin within Firebug UI (panels).
 */
Firebug.NavigationHistory = extend(Firebug.Module,
{
    currIndex: 0,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // History popup menu

    onPopupShowing: function(popup, context)
    {
        FBL.eraseNode(popup);

        var list = this.getHistory(context);

        // Don't display the popup for a single item.
        var count = list.length;
        if (count <= 1)
            return false;

        var maxItems = MAX_HISTORY_MENU_ITEMS;
        var half = Math.floor(maxItems / 2);
        var start = Math.max(this.currIndex - half, 0);
        var end = Math.min(start == 0 ? maxItems : this.currIndex + half + 1, count);

        if (end == count)
            start = Math.max(count - maxItems, 0);

        var tooltipBack = $STR("firebug.history.Go back to this panel");
        var tooltipCurrent = $STR("firebug.history.Stay on this panel");
        var tooltipForward = $STR("firebug.history.Go forward to this panel");

        for (var i=end-1; i>=start; i--)
        {
            var historyItem = list[i];
            var panelType = Firebug.getPanelType(historyItem.panel.name);
            var label = Firebug.getPanelTitle(panelType);
            if (historyItem.location && historyItem.location.href)
                label += " - " + historyItem.location.href;

            var menuInfo = {
                label: label,
                nol10n: true,
                className: "menuitem-iconic fbURLMenuItem",
            };

            if (i < this.currIndex)
            {
                menuInfo.className += " navigationHistoryMenuItemBack";
                menuInfo.tooltiptext = tooltipBack;
            }
            else if (i == this.currIndex)
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

            var menuItem = FBL.createMenuItem(popup, menuInfo);
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
        this.gotoHistoryIndex(context, --this.currIndex);
    },

    goForward: function(context)
    {
        this.gotoHistoryIndex(context, ++this.currIndex);
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
            Firebug.chrome.navigate(historyItem.location, historyItem.panel.name);
            this.currIndex = index;
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

        var backButton = $("fbNavigateBackButton");
        var forwardButton = $("fbNavigateForwardButton");

        backButton.setAttribute("disabled", "true");
        forwardButton.setAttribute("disabled", "true");

        if (list.length <= 1)
            return;

        if (this.currIndex > 0)
            backButton.removeAttribute("disabled");

        if (this.currIndex < list.length-1)
            forwardButton.removeAttribute("disabled");
    },

    getHistory: function(context)
    {
        if (!context.navigationHistory)
            context.navigationHistory = [];

        return context.navigationHistory;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI Listener

    onPanelNavigate: function(location, panel)
    {
        if (FBTrace.DBG_HISTORY)
            FBTrace.sysout("history.onPanelNavigate; " +
                "Panel: " + (panel ? panel.name : "Unknown Panel") +
                "Location: " + (location ? location.href : "No Location"),
                {panel: panel.constructor.prototype.title, location: location});

        // The panel must be always there
        if (!panel)
            return;

        // The user is navigating using the history UI, this action doesn't affect
        // the history list.
        if (this.navInProgress)
            return;

        var list = this.getHistory(panel.context);

        // Remove forward history.
        list.splice(this.currIndex+1, list.length-(this.currIndex+1));

        // If the last item in the history is the same bail out.
        var lastHistoryItem = list.length ? list[list.length-1] : null;
        if (lastHistoryItem && lastHistoryItem.panel == panel &&
            lastHistoryItem.location == location)
            return;

        if (lastHistoryItem && lastHistoryItem.location && location &&
            lastHistoryItem.location.href == location.href)
            return;

        list.push({panel: panel, location: location});
        this.currIndex = list.length-1;

        // Update back and forward buttons in the UI.
        this.updateButtons(panel.context);
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.NavigationHistory);
Firebug.registerUIListener(Firebug.NavigationHistory);

// ************************************************************************************************
}});
