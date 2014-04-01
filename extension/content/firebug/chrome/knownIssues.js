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
    "firebug/chrome/panelActivation",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/xpcom",
],
function(Firebug, FBTrace, Obj, Options, Dom, Firefox, Domplate, Locale, FirebugReps, Win,
    PanelActivation, Events, Css, Xpcom) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var {domplate, SPAN, P, DIV, BUTTON, TABLE, TR, TD, TBODY} = Domplate;

var slowJSDBugUrl = "https://bugzilla.mozilla.org/show_bug.cgi?id=815603";
var firebug20Url = "https://getfirebug.com/firebug2";

var comparator = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
var appInfo = Xpcom.CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
var Fx27 = (comparator.compare(appInfo.version, "27.0*") >= 0);

var jsd = Xpcom.CCSV("@mozilla.org/js/jsd/debugger-service;1", "jsdIDebuggerService", true);

// ********************************************************************************************* //
// Slow JSD1 Message

var slowJsdTag =
    P({"class": "slowJsdMessage disabledPanelDescription",
        style: "margin: 15px 0 15px 0; color: green; font-family: sans-serif"}
    );

var slowJsdRep = domplate(Firebug.Rep,
{
    className: "text",

    tag:
        FirebugReps.OBJECTBOX(
            TABLE(
                TBODY(
                    TR(
                        TD({"valign": "middle"},
                            SPAN({"class": "slowJSD",
                                style: "font-family: sans-serif;"})
                        )

                        /*, xxxHonza: see issue 6942
                        TD({"valign": "middle", "style": "white-space: nowrap;"},
                            BUTTON({onclick: "$onClick"},
                                Locale.$STR("knownissues.message.slowJSD.GotIt")
                            )
                        )*/
                    )
                )
            )
        ),

    onClick: function(event)
    {
        Options.set("showSlowJSDMessage2", false);

        var row = Dom.getAncestorByClass(event.target, "logRow");
        row.parentNode.removeChild(row);

        Events.cancelEvent(event);
    }
});

// ********************************************************************************************* //
// JSD1 Removed Message

var jsdRemovedTag =
    P({"class": "jsdRemovedMessage disabledPanelDescription",
        style: "margin: 15px 0 15px 0; font-family: sans-serif"}
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
        PanelActivation.addListener(this);
    },

    shutdown: function()
    {
        Firebug.unregisterUIListener(this);
        PanelActivation.removeListener(this);

        Firebug.Module.shutdown.apply(this, arguments);
    },

    initContext: function(context)
    {
        Firebug.Module.initContext.apply(this, arguments);

        // Initialize default value.
        context.showSlowJSDMessage = Options.get("showSlowJSDMessage2");

        this.showSlowJSDMessage(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showSlowJSDMessage: function(context)
    {
        // The bug 815603 landed in Fx27, so do not display the warning anymore
        // (see also issue 7193)
        if (Fx27)
            return;

        // Do not display twice for this context
        if (!context || !context.showSlowJSDMessage)
            return;

        // The message is displayed only if the Console panel is enabled.
        if (!PanelActivation.isPanelEnabled(Firebug.getPanelType("console")))
            return;

        // The message is displayed only if the Script panel is enabled.
        if (!PanelActivation.isPanelEnabled(Firebug.getPanelType("script")))
            return;

        var row = Firebug.Console.log({}, context, "warn", slowJsdRep, true);

        // xxxHonza: couldn't we have vertical centering (50%) for all ".logRow" elements?
        row.setAttribute("style", "background-position: 4px 50%;")

        var parentNode = row.getElementsByClassName("slowJSD")[0];
        FirebugReps.Description.render(Locale.$STR("knownissues.message.slowJSD"),
            parentNode, Obj.bindFixed(Win.openNewTab, Win, slowJSDBugUrl));

        context.showSlowJSDMessage = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    /**
     * Issue 6821: Tell the user that JSD slows down opening Firebug and tab switching
     */
    showDisabledPanelBox: function(panelName, parentNode)
    {
        this.showJSDSlowMessage(panelName, parentNode);
        this.showJSDRemovedMessage(panelName, parentNode);
    },

    onOptionsMenu2: function(context, panelType, items)
    {
        if (panelType.prototype.name != "script")
            return;

        if (jsd)
            return;

        // Remove all items from the menu (only if JSD1 is not available).
        items.splice(0, items.length);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Script Panel Messages

    showJSDSlowMessage: function(panelName, parentNode)
    {
        // The bug 815603 landed in Fx27, so do not display the warning anymore
        // (see also issue 7193)
        if (Fx27)
            return;

        if (panelName != "script")
            return;

        var box = parentNode.getElementsByClassName("disabledPanelDescription")[0];
        var message = slowJsdTag.insertAfter({}, box);

        FirebugReps.Description.render(Locale.$STR("knownissues.message.slowJSD"),
            message, Obj.bindFixed(Win.openNewTab, Win, slowJSDBugUrl));
    },

    showJSDRemovedMessage: function(panelName, parentNode)
    {
        // The message is visible only if JSD has been removed.
        if (jsd)
            return;

        if (panelName != "script")
            return;

        var box = parentNode.getElementsByClassName("disabledPanelDescription")[0];
        var message = jsdRemovedTag.insertAfter({}, box);

        FirebugReps.Description.render(Locale.$STR("knownissues.message.jsdRemoved"),
            message, Obj.bindFixed(Win.openNewTab, Win, firebug20Url));

        box.parentNode.removeChild(box);

        var enableLink = parentNode.querySelector(".objectLink.enable");
        enableLink.parentNode.removeChild(enableLink);

        // Hide Script panel tab menu, there are no option if JSD1 is gone.
        var panelTab = Firebug.getPanelTab("script");
        panelTab.tabMenu.setAttribute("collapsed", "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // PanelActivation Listener

    activationChanged: function(panelType, enable)
    {
        this.showSlowJSDMessage(Firebug.currentContext);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(KnownIssues);

return KnownIssues;

// ********************************************************************************************* //
});
