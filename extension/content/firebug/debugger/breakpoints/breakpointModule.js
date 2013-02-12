/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/chrome/menu",
    "firebug/editor/editor",
    "firebug/console/autoCompleter"
],
function(Obj, Firebug, Locale, Events, Dom, Arr, Menu) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Breakpoints

Firebug.Breakpoint = Obj.extend(Firebug.Module,
{
    dispatchName: "BreakpointModule",

    toggleBreakOnNext: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable");

        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakpoint.toggleBreakOnNext; currentBreakable "+breakable+
                " in " + panel.context.getName());

        // Toggle button's state.
        breakable = (breakable == "true" ? "false" : "true");
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", breakable);

        // Call the current panel's logic related to break-on-next.
        // If breakable == "true" the feature is currently disabled.
        var enabled = (breakable == "true" ? false : true);
        panel.breakOnNext(enabled);

        // Make sure the correct tooltip (coming from the current panel) is used.
        this.updateBreakOnNextTooltips(panel);

        // Light up the tab whenever break on next is selected
        this.updatePanelTab(panel, enabled);

        return enabled;
    },

    showPanel: function(browser, panel)
    {
        if (!panel)  // there is no selectedPanel?
            return;

        var breakButton = Firebug.chrome.$("fbBreakOnNextButton");
        if (panel.name)
            breakButton.setAttribute("panelName", panel.name);

        breakButton.removeAttribute("type");
        Dom.collapse(Firebug.chrome.$("fbBonButtons"), !panel.breakable);

        // The script panel can be created at this moment (the second parameter is false)
        // It's needed for break on next to work (do not wait till the user actuall
        // selectes the panel).
        var scriptPanel = panel.context.getPanel("script");
        var scriptEnabled = scriptPanel && scriptPanel.isEnabled();
        var tool = Firebug.connection.getTool("script");
        var scriptActive = tool && tool.getActive();
        var supported = panel.supportsBreakOnNext();

        // Enable by default and disable if needed.
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "disabled", null);

        // Disable BON if script is disabled or if BON isn't supported by the current panel.
        if (!scriptEnabled || !scriptActive || !supported)
        {
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", "disabled");
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "disabled", "true");
            this.updateBreakOnNextTooltips(panel);
            return;
        }

        // Set the tooltips and update break-on-next button's state.
        var shouldBreak = panel.shouldBreakOnNext();
        this.updateBreakOnNextState(panel, shouldBreak);
        this.updateBreakOnNextTooltips(panel);
        this.updatePanelTab(panel, shouldBreak);

        var menuItems = panel.getBreakOnMenuItems();
        if (!menuItems || !menuItems.length)
            return;

        breakButton.setAttribute("type", "menu-button");

        var menuPopup = Firebug.chrome.$("fbBreakOnNextOptions");
        Dom.eraseNode(menuPopup);

        for (var i=0; i<menuItems.length; ++i)
            Menu.createMenuItem(menuPopup, menuItems[i]);
    },

    /* see issue 5618
    toggleTabHighlighting: function(event)
    {
        // Don't continue if it's the wrong animation phase
        if (Math.floor(event.elapsedTime * 10) % (animationDuration * 20) != 0)
            return;

        Events.removeEventListener(event.target, "animationiteration",
            Firebug.Breakpoint.toggleTabHighlighting, true);

        var panel = Firebug.currentContext.getPanel(event.target.panelType.prototype.name);
        if (!panel)
            return;

        if (!panel.context.delayedArmedTab)
            return;

        panel.context.delayedArmedTab.setAttribute("breakOnNextArmed", "true");
        delete panel.context.delayedArmedTab;
    },
    */

    updateBreakOnNextTooltips: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable");

        // Get proper tooltip for the break-on-next button from the current panel.
        // If breakable is set to "false" the feature is already activated (throbbing).
        var armed = (breakable == "false");
        var tooltip = panel.getBreakOnNextTooltip(armed);
        if (!tooltip)
            tooltip = "";

        // The user should know that BON is disabled if the Script panel (debugger) is disabled.
        if (breakable == "disabled")
            tooltip += " " + Locale.$STR("firebug.bon.scriptPanelNeeded");

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "tooltiptext", tooltip);
    },

    updateBreakOnNextState: function(panel, armed)
    {
        // If the panel should break at the next chance, set the button to not breakable,
        // which means already active (throbbing).
        var breakable = armed ? "false" : "true";
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", breakable);
    },

    updatePanelTab: function(panel, armed)
    {
        if (!panel)
            return;

        // If the script panels is disabled, BON can't be active.
        if (!Firebug.PanelActivation.isPanelEnabled("script"))
            armed = false;

        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(panel.name);
        if (tab)
            tab.setAttribute("breakOnNextArmed", armed ? "true" : "false");

        /* see issue 5618
        {
            if (armed)
            {
                // If there is already a panel armed synchronize highlighting of the panel tabs
                var tabPanel = tab.parentNode;
                var otherTabIsArmed = false;
                for (var i = 0; i < tabPanel.children.length; ++i)
                {
                    var panelTab = tabPanel.children[i];
                    if (panelTab !== tab && panelTab.getAttribute("breakOnNextArmed") == "true")
                    {
                        panel.context.delayedArmedTab = tab;
                        Events.addEventListener(panelTab, "animationiteration",
                            this.toggleTabHighlighting, true);
                        otherTabIsArmed = true;
                        break;
                    }
                }

                if (!otherTabIsArmed)
                    tab.setAttribute("breakOnNextArmed", "true");
            }
            else
            {
                delete panel.context.delayedArmedTab;
                tab.setAttribute("breakOnNextArmed", "false");
            }
        }
        */
    },

    updatePanelTabs: function(context)
    {
        if (!context)
            return;

        var panelTypes = Firebug.getMainPanelTypes(context);
        for (var i=0; i<panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            var panel = context.getPanel(panelType.prototype.name);
            var shouldBreak = (panel && panel.shouldBreakOnNext()) ? true : false;
            this.updatePanelTab(panel, shouldBreak);
        }
    },

    // supports non-JS break on next
    breakNow: function(panel)
    {
        this.updatePanelTab(panel, false);
        Firebug.Debugger.breakNow(panel.context);  // TODO BTI
    },

    updateOption: function(name, value)
    {
        if (name == "showBreakNotification")
        {
            var panelBar1 = Firebug.chrome.$("fbPanelBar1");
            var doc = panelBar1.browser.contentDocument;
            var checkboxes = doc.querySelectorAll(".doNotShowBreakNotification");

            for (var i=0; i<checkboxes.length; i++)
                checkboxes[i].checked = !value;
        }
    },
});

// ********************************************************************************************* //

function countBreakpoints(context)
{
    var count = 0;
    for (var url in context.sourceFileMap)
    {
        FBS.enumerateBreakpoints(url, {call: function(url, lineNo)
        {
            ++count;
        }});
    }
    return count;
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.Breakpoint);

return Firebug.Breakpoint;

// ********************************************************************************************* //
});
