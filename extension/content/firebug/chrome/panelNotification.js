/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/chrome/window",
    "firebug/lib/css",
    "firebug/lib/dom",
],
function(Firebug, FBTrace, Domplate, Locale, Win, Css, Dom) {

"use strict";

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var {domplate, DIV, TABLE, TBODY, TR, TD, SPAN, BUTTON} = Domplate;

// ********************************************************************************************* //
// Implementation

var PanelNotification = domplate(
{
    tag:
        TABLE({"class": "panelNotification", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "panelNotificationRow"},
                    TD({"class": "panelNotificationCol"},
                        SPAN({"class": "panelNotificationMessage"},
                            "$message"
                        )
                    ),
                    TD({"class": "panelSeparatorCol"}),
                    TD({"class": "panelNotificationCol"},
                        BUTTON({"class": "panelNotificationButton",
                            title: "$buttonTooltip",
                            onclick: "$onPreferences"},
                            "$buttonLabel"
                        )
                    )
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onPreferences: function(event)
    {
        var table = Dom.getAncestorByClass(event.target, "panelNotification");
        Win.openNewTab("about:config?filter=" + table.config.prefName);
    },

    // xxxHonza: this API should be a little more generic
    updateCounter: function(row)
    {
        var container = Dom.getAncestorByClass(row, "panelNotificationBox");
        if (container)
            Css.removeClass(container, "collapsed");

        // Update info within the limit row.
        var message = row.getElementsByClassName("panelNotificationMessage").item(0);
        message.firstChild.nodeValue = Locale.$STRP("plural.Limit_Exceeded2",
            [row.config.totalCount]);
    },

    render: function(parent, config)
    {
        // Set default values
        config.buttonTooltip = config.buttonTooltip || null;
        config.buttonLabel = config.buttonLabel || Locale.$STR("LimitPrefs");
        config.message = config.message || Locale.$STRP("plural.Limit_Exceeded2", [0]);

        var element = this.tag.append(config, parent, this);
        element.config = config;
        return element;
    }
});

// ********************************************************************************************* //
// Registration

return PanelNotification;

// ********************************************************************************************* //
});
