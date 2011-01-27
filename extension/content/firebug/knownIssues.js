/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
const appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);

// ************************************************************************************************

/**
 * This module is responsible for displaying a link to known issues:
 * http://getfirebug.com/knownissues
 */
Firebug.KnownIssues = extend(Firebug.Module,
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

        Firebug.commandLineShowCompleterPopup = Firebug.getPref(Firebug.prefDomain, popupPrefName);

        // In Firefox 4.0b7+ the addon-toolbar is not showing up. We'll show it once just
        // in case the user overlooks the new Firebug start-button in the toolbar. As soon
        // as users will get used to the toolbar button this could be removed completely.
        if (!Firebug.addonBarOpened)
        {
            var addonBar = document.getElementById("addon-bar");
            setToolbarVisibility(addonBar, true)

            // This is just one time operation.
            Firebug.setPref(Firebug.prefDomain, "addonBarOpened", true);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Set commandLineShowCompleterPopup " +
                Firebug.commandLineShowCompleterPopup);
    },

    showPanel: function(browser, panel)
    {
        if (!panel)
            return;

        // Only display if the console panel is actually visible.
        if (panel && panel.name != "console")
            return;

        // Don't display if it was already displayed before.
        if (panel.panelNode.querySelector(".objectLink.knownIssues"))
            return;

        // Display the message only for Firefox 40
        if (versionChecker.compare(appInfo.version, "4.0*") < 0)
            return;

        try
        {
            // Log the message into the console.
            Firebug.Console.log([], panel.context, "info", Firebug.KnownIssuesRep);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.KnownIssues.showPanel; EXCEPTION", e);
        }
    }
});

// ************************************************************************************************

Firebug.KnownIssuesRep = domplate(Firebug.Rep,
{
    className: "text",

    tag:
        FirebugReps.OBJECTBOX({onclick: ""},
            SPAN($STR("message.knownIssues40")),
            SPAN("&nbsp;"),
            SPAN({"class": "objectLink knownIssues", style: "color:blue", onclick: "$onclick"},
                "http://getfirebug.com/knownissues"
            )
        ),

    onclick: function(event)
    {
        openNewTab("http://getfirebug.com/knownissues");
    }
});

// ************************************************************************************************

Firebug.registerModule(Firebug.KnownIssues);

// ************************************************************************************************
return Firebug.KnownIssues;
}});
