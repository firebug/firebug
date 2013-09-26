/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/dom",
    "firebug/chrome/firefox",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/chrome/reps",
    "firebug/chrome/window",
],
function(Firebug, FBTrace, Obj, Options, Dom, Firefox, Domplate, Locale, FirebugReps, Win) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var {domplate, DIV, P} = Domplate;

// ********************************************************************************************* //
// Domplate Templates

var slowJsdTag =
    P({"class": "slowJsdMessage disabledPanelDescription",
        style: "margin: 15px 0 15px 0; color: green"}
    );

// ********************************************************************************************* //

/**
 * This module is responsible for various hacks and workarounds related
 * to known platform issues.
 */
var KnownIssues = Obj.extend(Firebug.Module,
/** @lends KnownIssues */
{
    dispatchName: "knownIssues",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(prefDomain, prefNames)
    {
        Firebug.Module.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    /**
     * Issue 6821: Tell the user that JSD slows down opening Firebug and tab switching
     */
    showDisabledPanelBox: function(panelName, parentNode)
    {
        if (panelName != "script")
            return;

        var box = parentNode.getElementsByClassName("disabledPanelDescription")[0];
        var message = slowJsdTag.insertAfter({}, box);

        var url = "https://bugzilla.mozilla.org/show_bug.cgi?id=815603";
        FirebugReps.Description.render(Locale.$STR("knownissues.message.slowJSD"),
            message, Obj.bindFixed(Win.openNewTab, Win, url));
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(KnownIssues);

return KnownIssues;

// ********************************************************************************************* //
});
