/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

var popup = $("fbStatusContextMenu");
var statusBar = $("fbStatusBar");
var statusText = $("fbStatusText");

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
Firebug.StartButton = extend(Firebug.Module,
/** @lends Firebug.StartButton */
{
    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        // Associate a popup-menu with the start button (the same as it's
        // used for the obsolete status bar icon.
        var startButton = $("firebug-button");
        if (startButton)
        {
            startButton.appendChild(popup.cloneNode(true));

            // Append the button into Firefox toolbar automatically.
            this.appendToToolbar();

            // In case of Firefox 4+ the button is a bit different.
            if (versionChecker.compare(appInfo.version, "4.0*") >= 0)
                startButton.setAttribute("firefox", "4");
        }

        this.removeStatusIcon();

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Startbutton initializeUI "+startButton);
    },

    shutdown: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Appends Firebug start button into Firefox toolbar automatically after installation.
     * The button is appended only once so, if the user removes it, it isn't appended again.
     */
    appendToToolbar: function()
    {
        if (Firebug.Options.get("toolbarCustomizationDone"))
            return;

        Firebug.Options.set("toolbarCustomizationDone", true);

        // Get the current navigation bar button set (a string of button IDs) and append
        // ID of the Firebug start button into it.
        var startButtonId = "firebug-button";
        var navBarId = "nav-bar";
        var navBar = $(navBarId);

        // In SeaMonkey we need to read the attribute (see issue 4086)
        // In Firefox the currentSet property must be used.
        var currentSet = navBar.getAttribute("currentset");
        if (!currentSet)
            currentSet = navBar.currentSet;

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Startbutton; curSet: " + currentSet);

        // Append only if the button is not already there.
        var curSet = currentSet.split(",");
        if (curSet.indexOf(startButtonId) == -1)
        {
            var set = curSet.concat(startButtonId);
            navBar.setAttribute("currentset", set.join(","));
            document.persist(navBarId, "currentset");

            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("Startbutton; curSet (after modification): " + set.join(","));

            try
            {
                BrowserToolboxCustomizeDone(true);
            }
            catch (e)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("startButton; appendToToolbar EXCEPTION " + e, e);
            }
        }

        // Don't forget to show the navigation bar - just in case it's hidden.
        collapse(navBar, false);
        document.persist(navBarId, "collapsed");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for the status bar (OBSOLETE in Fx4)

    removeStatusIcon: function()
    {
        if (Firebug.Options.get("showStatusIcon"))
            return;

        var statusBar = $("fbStatusBar");
        if (statusBar)
            statusBar.parentNode.removeChild(statusBar);
    },

    updateOption: function(name, value)
    {
        if (name === "showStatusIcon")
            this.removeStatusIcon();
    },

    onClickStatusText: function(context, event)
    {
        if (event.button != 0)
            return;

        if (!context || !context.errorCount)
            return;

        var panel = Firebug.chrome.getSelectedPanel();
        if (panel && panel.name != "console")
        {
            Firebug.chrome.selectPanel("console");
            cancelEvent(event);
        }
    },

    onClickStatusIcon: function(context, event)
    {
        if (event.button != 0)
            return;
        else if (isControl(event))
            Firebug.toggleDetachBar(true);
        else if (context && context.errorCount)
            Firebug.toggleBar(undefined, "console");
        else
            Firebug.toggleBar();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Error count

    showCount: function(errorCount)
    {
        if (!statusBar)
            return;

        var firebugButton = $("firebug-button");
        if (errorCount && Firebug.showErrorCount)
        {
            statusBar.setAttribute("showErrors", "true")
            statusText.setAttribute("value", $STRP("plural.Error_Count2", [errorCount]));

            if (firebugButton)
            {
                firebugButton.setAttribute("showErrors", "true");
                firebugButton.setAttribute("errorCount", errorCount);
            }
        }
        else
        {
            statusBar.removeAttribute("showErrors");
            statusText.setAttribute("value", "");

            if (firebugButton)
            {
                firebugButton.removeAttribute("showErrors");

                // Use '0' so, the horizontal space for the number is still allocated.
                // The button will cause re-layout if there is more than 9 errors.
                firebugButton.setAttribute("errorCount", "0");
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tooltip

    resetTooltip: function()
    {
        if (FBTrace.DBG_TOOLTIP)
            FBTrace.sysout("resetTooltip called");

        var tooltip = "Firebug " + Firebug.getVersion();

        tooltip += "\n" + this.getEnablementStatus();

        if (Firebug.getSuspended())
            tooltip += "\n" + Firebug.getSuspended();
        else
            tooltip += "\n" + $STRP("plural.Total_Firebugs2", [Firebug.TabWatcher.contexts.length]);

        if (Firebug.allPagesActivation == "on")
        {
            var label = $STR("enablement.on");
            tooltip += "\n"+label+" "+$STR("enablement.for all pages");
        }
        // else allPagesActivation == "none" we don't show it.

        tooltip += "\n" + $STR(Firebug.getPlacement());

        var firebugStatus = $("firebugStatus");
        firebugStatus.setAttribute("tooltiptext", tooltip);
    },

    getEnablementStatus: function()
    {
        var strOn = $STR("enablement.on");
        var strOff = $STR("enablement.off");

        var status = "";
        var firebugStatus = $("firebugStatus");

        if (firebugStatus.getAttribute("console") == "on")
            status += "Console: " + strOn + ",";
        else
            status += "Console: " + strOff + ",";

        if (firebugStatus.getAttribute("net") == "on")
            status += " Net: " + strOn + ",";
        else
            status += " Net: " + strOff + ",";

        if (firebugStatus.getAttribute("script") == "on")
            status += " Script: " + strOn;
        else
            status += " Script: " + strOff + "";

        return status;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.StartButton);

// ********************************************************************************************* //
}});
