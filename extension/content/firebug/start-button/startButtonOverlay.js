/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ********************************************************************************************* //
// Constants

var popup = $("fbStatusContextMenu");

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
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.StartButton);

// ********************************************************************************************* //
}});
