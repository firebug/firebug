/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/locale",
    "fbtrace/lib/domplate",
    "fbtrace/lib/dom",
],
function(FBTrace, Locale, Domplate, Dom) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Trace Console Rep

var PanelTemplate = domplate(
{
    tag:
        TABLE({"class": "traceTable", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "traceInfoRow"},
                    TD({"class": "traceInfoCol"},
                        DIV({"class": "traceInfoBody"},
                            DIV({"class": "traceInfoTabs"},
                                A({"class": "traceInfoLogsTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Logs"},
                                    Locale.$STR("tracing.tab.Logs")
                                ),
                                A({"class": "traceInfoOptionsTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Options"},
                                    Locale.$STR("tracing.tab.Options")
                                ),
                                A({"class": "traceInfoGlobalTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Global"},
                                    Locale.$STR("tracing.tab.Global Events")
                                )
                            ),
                            DIV({"class": "traceInfoLogsText traceInfoText"},
                                IFRAME({"class": "traceInfoLogsFrame",
                                    src: "chrome://fbtrace/content/traceLogFrame.html"}
                                )
                            ),
                            DIV({"class": "traceInfoOptionsText traceInfoText"}),
                            DIV({"class": "traceInfoGlobalText traceInfoText"})
                        )
                    )
                )
            )
        ),

    onClickTab: function(event)
    {
        this.selectTab(event.currentTarget);
    },

    selectTabByName: function(parentNode, tabName)
    {
        var tab = parentNode.getElementsByClassName("traceInfo" + tabName + "Tab").item(0);
        if (tab)
            this.selectTab(tab);
    },

    selectTab: function(tab)
    {
        var messageInfoBody = tab.parentNode.parentNode;

        var view = tab.getAttribute("view");
        if (messageInfoBody.selectedTab)
        {
            messageInfoBody.selectedTab.removeAttribute("selected");
            messageInfoBody.selectedText.removeAttribute("selected");
        }

        var textBodyName = "traceInfo" + view + "Text";

        messageInfoBody.selectedTab = tab;
        messageInfoBody.selectedText = Dom.getChildByClass(messageInfoBody, textBodyName);

        messageInfoBody.selectedTab.setAttribute("selected", "true");
        messageInfoBody.selectedText.setAttribute("selected", "true");
    }
});

// ********************************************************************************************* //
// Registration

return PanelTemplate;

// ********************************************************************************************* //
}});
