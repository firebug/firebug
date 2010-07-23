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

    showPanel: function(browser, panel)
    {
        // Only display if the console panel is actually visible.
        if (panel && panel.name != "console")
            return;

        // Don't display if it was already displayed before.
        if (Firebug.knownIssues40Displayed)
            return;

        // Display the message only for Firefox 40
        if (versionChecker.compare(appInfo.version, "4.0*") < 0)
            return;

        // Don't display the message again.
        Firebug.setPref(Firebug.prefDomain, "knownIssues40Displayed", true);

        // Log the message into the console.
        Firebug.Console.log([], panel.context, "info", Firebug.KnownIssuesRep);
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
            SPAN({"class": "objectLink", style: "color:blue", onclick: "$onclick"},
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
}});
