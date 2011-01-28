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
var firebugButton = $("firebug-button");

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
        startButton.appendChild(popup.cloneNode(true));

        // Append the button into Firefox toolbar automatically.
        this.appendToToolbar();

        // If Firefox version is 4+, let's 
        if (versionChecker.compare(appInfo.version, "4.0*") >= 0)
            startButton.setAttribute("firefox", "4");
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
        if (Firebug.getPref(Firebug.prefDomain, "toolbarCustomizationDone"))
            return;

        Firebug.setPref(Firebug.prefDomain, "toolbarCustomizationDone", true);

        // Get the current navigation bar button set (a string of button IDs) and append
        // ID of the Firebug start button into it.
        var startButtonId = "firebug-button";
        var afterId = "urlbar-container";
        var navBar = $("nav-bar");
        var curSet = navBar.currentSet.split(",");

        // Append only if the button is not already there.
        if (curSet.indexOf(startButtonId) == -1)
        {
            var set = curSet.concat(startButtonId);

            navBar.setAttribute("currentset", set.join(","));
            navBar.currentSet = set.join(",");
            document.persist(navBar.id, "currentset");

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
        // setToolbarVisibility() comes from browser.js
        setToolbarVisibility(navBar, true)
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for the status bar (OBSOLETE in Fx4)

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

        if (errorCount)
        {
            if (Firebug.showErrorCount)
            {
                statusText.setAttribute("shown", "true")
                statusText.setAttribute("value", $STRP("plural.Error_Count2", [errorCount]));

                firebugButton.setAttribute("showErrors", "true");
                firebugButton.setAttribute("errorCount", errorCount);
            }
            else
            {
                statusText.removeAttribute("shown");
                firebugButton.removeAttribute("showErrors");

                // Use '0' so, the horizontal space for the number is still allocated.
                // The button will cause re-layout if there is more than 9 errors.
                firebugButton.setAttribute("errorCount", "0");
            }

            statusBar.setAttribute("errors", "true");
        }
        else
        {
            statusText.setAttribute("value", "");
            statusBar.removeAttribute("errors");

            // Use '0' so, the horizontal space for the number is still allocated.
            // The button will cause re-layout if there is more than 9 errors.
            firebugButton.setAttribute("errorCount", "0");
        }
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.StartButton);

// ********************************************************************************************* //
}});
