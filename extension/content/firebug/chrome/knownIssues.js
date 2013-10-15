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
],
function(Firebug, FBTrace, Obj, Options, Dom, Firefox, Domplate, Locale, FirebugReps, Win,
    PanelActivation, Events, Css) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var {domplate, SPAN, P, DIV, BUTTON, TABLE, TR, TD, TBODY} = Domplate;

var slowJSDBugUrl = "https://bugzilla.mozilla.org/show_bug.cgi?id=815603";

// ********************************************************************************************* //
// Domplate

var slowJsdTag =
    P({"class": "slowJsdMessage disabledPanelDescription",
        style: "margin: 15px 0 15px 0; color: green"}
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
                            SPAN({"class": "slowJSD"})
                        ),
                        TD({"valign": "middle", "style": "white-space: nowrap;"},
                            BUTTON({onclick: "$onClick"},
                                Locale.$STR("knownissues.message.slowJSD.GotIt")
                            )
                        )
                    )
                )
            )
        ),

    onClick: function(event)
    {
        Options.set("showSlowJSDMessage", false);

        var row = Dom.getAncestorByClass(event.target, "logRow");
        row.parentNode.removeChild(row);

        Events.cancelEvent(event);
    }
});

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
        context.showSlowJSDMessage = Options.get("showSlowJSDMessage");

        this.showSlowJSDMessage(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showSlowJSDMessage: function(context)
    {
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
        if (panelName != "script")
            return;

        var box = parentNode.getElementsByClassName("disabledPanelDescription")[0];
        var message = slowJsdTag.insertAfter({}, box);

        FirebugReps.Description.render(Locale.$STR("knownissues.message.slowJSD"),
            message, Obj.bindFixed(Win.openNewTab, Win, slowJSDBugUrl));
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
