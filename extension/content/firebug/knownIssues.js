/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/firebug",
],
function(FBL, Firebug) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
const appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);

// ********************************************************************************************* //

/**
 * This module is responsible for varisous hacky solutions related to known issues.
 */
Firebug.KnownIssues = FBL.extend(Firebug.Module,
/** @lends Firebug.KnownIssues */
{
    dispatchName: "knownIssues",

    initialize: function()
    {
        var popupPrefName = "commandLineShowCompleterPopup";
        if (/Linux/.test(window.navigator.platform))
            Firebug.registerPreference(popupPrefName, false);
        else
            Firebug.registerPreference(popupPrefName, true);

        Firebug.commandLineShowCompleterPopup = Firebug.Options.get(popupPrefName);

        // In Firefox 4.0b7+ the addon-toolbar is not showing up. We'll show it once just
        // in case the user overlooks the new Firebug start-button in the toolbar. As soon
        // as users will get used to the toolbar button this could be removed completely.
        if (!Firebug.addonBarOpened)
        {
            var addonBar = document.getElementById("addon-bar");

            // Open the addon bar
            FBL.collapse(addonBar, false);
            document.persist("addon-bar", "collapsed");

            // This is just one time operation.
            Firebug.Options.set("addonBarOpened", true);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Set commandLineShowCompleterPopup " +
                Firebug.commandLineShowCompleterPopup);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.KnownIssues);

return Firebug.KnownIssues;

// ********************************************************************************************* //
});
