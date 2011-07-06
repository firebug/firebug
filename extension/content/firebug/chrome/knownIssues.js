/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/firebug",
    "firebug/lib/dom",
    "firebug/firefox/firefox",
],
function(Obj, Options, Firebug, Dom, Firefox) {

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
Firebug.KnownIssues = Obj.extend(Firebug.Module,
/** @lends Firebug.KnownIssues */
{
    dispatchName: "knownIssues",

    initialize: function()
    {
        var popupPrefName = "commandLineShowCompleterPopup";
        if (/Linux/.test(window.navigator.platform))
            Options.register(popupPrefName, false);
        else
            Options.register(popupPrefName, true);

        Firebug.commandLineShowCompleterPopup = Firebug.Options.get(popupPrefName);

        // In Firefox 4.0b7+ the addon-toolbar is not showing up. We'll show it once just
        // in case the user overlooks the new Firebug start-button in the toolbar. As soon
        // as users will get used to the toolbar button this could be removed completely.
        if (!Firebug.addonBarOpened)
        {
            var addonBar = Firefox.getElementById("addon-bar");

            // Open the addon bar
            Dom.collapse(addonBar, false);
            document.persist("addon-bar", "collapsed");

            // This is just one time operation.
            Firebug.Options.set("addonBarOpened", true);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Set commandLineShowCompleterPopup " +
                Firebug.commandLineShowCompleterPopup);
    },

    internationalizeUI: function(doc)
    {
        // See also issue 4529. Since the memory profiler is still a lab thing,
        // hide the "Memory Profiler" button begin a pref.
        if (!Options.get("memoryProfilerEnable"))
        {
            var button = doc.getElementById("fbToggleMemoryProfiling");
            Dom.collapse(button, true);
        }
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.KnownIssues);

return Firebug.KnownIssues;

// ********************************************************************************************* //
});
