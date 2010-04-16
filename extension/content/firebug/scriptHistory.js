/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const MAX_HISTORY_MENU_ITEMS = 15;

// ************************************************************************************************

/**
 * @class Support for back and forward pattern for navigatin among script files that
 * have been displayed in the Script panel.
 */
Firebug.Debugger.ScriptHistory = extend(Firebug.Module, 
{
    currIndex: 0,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Extending Module

    onCreatePanel: function(context, panel, panelType)
    {
        if (!(panel instanceof Firebug.ScriptPanel))
            return;

        panel.addListener(this);

        if (FBTrace.DBG_SCRIPTHISTORY)
            FBTrace.sysout("scripthistory.onCreatePanel; Register as Script panel listener");
    },

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

        var tooltipBack = $STR("firebug.history.Go back to this script");
        var tooltipCurrent = $STR("firebug.history.Stay on this page");
        var tooltipForward = $STR("firebug.history.Go forward to this script");

        for (var i=end-1; i>=start; i--)
        {
            var sourceFile = list[i];
            var menuInfo = {
                label: sourceFile.href,
                nol10n: true,
                className: "menuitem-iconic fbURLMenuItem",
            };

            if (i < this.currIndex)
            {
                menuInfo.className += " scriptHistoryMenuItemBack";
                menuInfo.tooltiptext = tooltipBack;
            }
            else if (i == this.currIndex)
            {
                menuInfo.type = "radio";
                menuInfo.checked = "true";
                menuInfo.className = "scriptHistoryMenuItemCurrent";
                menuInfo.tooltiptext = tooltipCurrent;
            }
            else
            {
                menuInfo.className += " scriptHistoryMenuItemForward";
                menuInfo.tooltiptext = tooltipForward;
            }

            var menuItem = FBL.createMenuItem(popup, menuInfo);
            menuItem.repObject = sourceFile;
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

        var sourceFile = list[index];

        try
        {
            this.navInProgress = true;
            FirebugChrome.select(new SourceLink(sourceFile.href, undefined, "js"), "script");
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

        var backButton = $("fbScriptBackButton");
        var forwardButton = $("fbScriptForwardButton");

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
        if (!context.scriptPanelHistory)
            context.scriptPanelHistory = [];

        return context.scriptPanelHistory;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Firebug.ScriptPanel listener

    onUpdateScriptLocation: function(panel, sourceFile)
    {
        if (this.navInProgress)
            return;

        if (!(sourceFile instanceof Firebug.SourceFile))
        {
            if (FBTrace.DBG_SCRIPTHISTORY)
                FBTrace.sysout("scripthistory.onUpdateScriptLocation; ERROR not instane of SourceFile",
                    sourceFile);
            return;
        }

        var list = this.getHistory(panel.context);

        // Remove forward history.
        list.splice(this.currIndex+1, list.length-(this.currIndex+1));

        // If the last file in the history is the same bail out.
        if (list.length && list[list.length-1].href == sourceFile.href)
            return;

        if (FBTrace.DBG_SCRIPTHISTORY)
            FBTrace.sysout("scripthistory.onUpdateScriptLocation; Append to history: " +
                sourceFile.href, sourceFile);

        list.push(sourceFile);
        this.currIndex = list.length-1;

        // Update back and forward buttons in the UI.
        this.updateButtons(panel.context);
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.Debugger.ScriptHistory);

// ************************************************************************************************
}});
