/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/options"
],
function(Obj, Firebug, Firefox, Locale, Events, Dom, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Module Implementation

/**
 * @module StartButton module represents the UI entry point to Firebug. This "start buttton"
 * formerly known as "the status bar icon" is automatically appended into Firefox toolbar
 * (since Firefox 4).
 *
 * Start button is associated with a menu (fbStatusContextMenu) that contains basic actions
 * such as panel activation and also indicates whether Firebug is activated/deactivated for
 * the current page (by changing its color).
 */
Firebug.StartButton = Obj.extend(Firebug.Module,
/** @lends Firebug.StartButton */
{
    dispatchName: "startButton",

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("StartButton.initializeUI;");
    },

    shutdown: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Error count

    showCount: function(errorCount)
    {
        var firebugButton = Firefox.getElementById("firebug-button");
        if (errorCount && Firebug.showErrorCount)
        {
            if (firebugButton)
            {
                firebugButton.setAttribute("showErrors", "true");
                firebugButton.setAttribute("errorCount", errorCount);
            }
        }
        else
        {
            if (firebugButton)
            {
                firebugButton.removeAttribute("showErrors");

                // Use '0', so the horizontal space for the number is still allocated.
                // The button will cause re-layout if there are more than 9 errors.
                firebugButton.setAttribute("errorCount", "0");
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tooltip

    resetTooltip: function()
    {
        var tooltip = "Firebug " + Firebug.getVersion();
        tooltip += "\n" + this.getEnablementStatus();

        if (Firebug.getSuspended())
        {
            tooltip += "\n" + this.getSuspended();
        }
        else
        {
            tooltip += "\n" + Locale.$STRP("plural.Total_Firebugs2",
                [Firebug.TabWatcher.contexts.length]);
        }

        if (Firebug.allPagesActivation == "on")
        {
            var label = Locale.$STR("enablement.on");
            tooltip += "\n"+label+" "+Locale.$STR("enablement.for all pages");
        }
        // else allPagesActivation == "none" we don't show it.

        tooltip += "\n" + Locale.$STR(Firebug.getPlacement());

        var firebugStatus = Firefox.getElementById("firebugStatus");
        if (!firebugStatus)
            return;

        firebugStatus.setAttribute("tooltiptext", tooltip);

        // The start button is colorful only if there is a context
        var active = Firebug.currentContext ? "true" : "false";
        firebugStatus.setAttribute("firebugActive", active);

        if (FBTrace.DBG_TOOLTIP)
            FBTrace.sysout("StartButton.resetTooltip; called: firebug active: " + active);
    },

    getEnablementStatus: function()
    {
        var firebugStatus = Firefox.getElementById("firebugStatus");

        if (!firebugStatus)
            return;

        var panels = Firebug.getActivablePanelTypes();
        var statuses = [];
        var status = "";

        var strOn = Locale.$STR("enablement.on");
        var strOff = Locale.$STR("enablement.off");

        for (var i = 0; i < panels.length; ++i)
        {
            status = firebugStatus.getAttribute(panels[i].prototype.name) == "on" ? strOn : strOff;
            statuses.push(Locale.$STRF("panel.status", [Firebug.getPanelTitle(panels[i]), status]));
        }

        return statuses.join(", ");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activation

    getSuspended: function()
    {
        var suspendMarker = Firefox.getElementById("firebugStatus");
        if (suspendMarker && suspendMarker.hasAttribute("suspended"))
            return suspendMarker.getAttribute("suspended");

        return null;
    },

    setSuspended: function(value)
    {
        var suspendMarker = Firefox.getElementById("firebugStatus");

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("StartButton.setSuspended; to " + value + ". Browser: " +
                Firebug.chrome.window.document.title);

        if (value == "suspended")
            suspendMarker.setAttribute("suspended", value);
        else
            suspendMarker.removeAttribute("suspended");

        this.resetTooltip();
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.StartButton);

// ********************************************************************************************* //

return Firebug.StartButton;
});
