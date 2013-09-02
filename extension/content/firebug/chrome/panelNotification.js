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
                        SPAN({"class": "panelNotificationLabel"},
                            Locale.$STRP("plural.Limit_Exceeded2", [0])
                        )
                    ),
                    TD({style: "width:100%"}),
                    TD(
                        BUTTON({"class": "panelNotificationButton", title: "$limitPrefsTitle",
                            onclick: "$onPreferences"},
                          Locale.$STR("LimitPrefs")
                        )
                    ),
                    TD("&nbsp;")
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onPreferences: function(event)
    {
        Win.openNewTab("about:config");
    },

    updateCounter: function(row)
    {
        var container = Dom.getAncestorByClass(row, "limitRowContainer");
        if (container)
            Css.removeClass(container, "collapsed");

        // Update info within the limit row.
        var limitLabel = row.getElementsByClassName("panelNotificationLabel").item(0);
        limitLabel.firstChild.nodeValue = Locale.$STRP("plural.Limit_Exceeded2",
            [row.limitInfo.totalCount]);
    },

    render: function(parent, limitInfo)
    {
        var element = this.tag.replace(limitInfo, parent, this);
        element.limitInfo = limitInfo;
        return element;
    }
});

// ********************************************************************************************* //
// Registration

return PanelNotification;

// ********************************************************************************************* //
});
