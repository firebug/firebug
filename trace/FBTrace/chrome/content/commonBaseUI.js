/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/globalTab",
    "fbtrace/lib/menu",
    "fbtrace/lib/css",
    "fbtrace/lib/locale",
    "fbtrace/lib/options",
    "fbtrace/messageTemplate",
    "fbtrace/panelTemplate",
    "fbtrace/traceOptionsController",
],
function(FBTrace, GlobalTab, Menu, Css, Locale, Options, MessageTemplate, PanelTemplate,
    TraceOptionsController) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Variables

var timerUpdateButtons = -1;

// ********************************************************************************************* //
// CommonBaseUI

var CommonBaseUI = {

    destroy: function()
    {
        this.optionsController.removeObserver();
    },

    initializeContent: function(parentNode, outputNodes, prefDomain, callback)
    {
        var doc = parentNode.ownerDocument;

        // Create basic layout for trace console content.
        var rep = PanelTemplate;
        rep.tag.replace({}, parentNode, rep);

        // This IFRAME is the container for all logs.
        var logTabIframe = parentNode.getElementsByClassName("traceInfoLogsFrame").item(0);

        logTabIframe.addEventListener("load", function(event)
        {
            var frameDoc = logTabIframe.contentWindow.document;

            var rootNode = frameDoc.getElementById("traceLogContent");
            outputNodes.setScrollingNode(rootNode);

            var logNode = MessageTemplate.createTable(rootNode);

            function recalcLayout() {
               logTabIframe.style.height = (doc.defaultView.innerHeight - 25) + "px";
            }

            doc.defaultView.addEventListener("resize", function(event) {
               recalcLayout();
            }, true);

            recalcLayout();

            callback(logNode);
        }, true);

        // Initialize content for Options tab (a button for each DBG_ option).
        var optionsBody = parentNode.getElementsByClassName("traceInfoOptionsText").item(0);

        // Customize layout of options.
        var tabular = Options.get("fbtrace.tabularOptionsLayout");
        optionsBody.setAttribute("tabular", tabular);

        this.optionsController = new TraceOptionsController(prefDomain,
        function updateButton(optionName, optionValue)
        {
            var button = parentNode.ownerDocument.getElementById(optionName);
            if (button)
                button.setAttribute("checked", optionValue?"true":"false");
            else if (timerUpdateButtons === -1)
            {
                FBTrace.sysout("traceModule onPrefChange no button with name "+optionName+
                    " in parentNode; regenerate options panel", parentNode);

                timerUpdateButtons = setTimeout(() => {
                    timerUpdateButtons = -1;
                    CommonBaseUI.generateOptionsButton(optionsBody);
                });
            }
        });

        this.generateOptionsButton(optionsBody);

        try
        {
            // Initialize global options
            var globalBody = parentNode.querySelector(".traceInfoGlobalText");
            if (globalBody)
                GlobalTab.render(globalBody);
        }
        catch (e)
        {
            window.dump("FBTrace; globalOptions EXCEPTION " + e + "\n");
        }

        // Select default tab.
        rep.selectTabByName(parentNode, "Logs");

        this.optionsController.addObserver();
    },

    generateOptionsButton: function(optionsBody)
    {
        // Empty optionsBody if we regenerate the Options.
        optionsBody.innerHTML = "";

        var doc = optionsBody.ownerDocument;
        var menuitems = this.optionsController.getOptionsMenuItems();
        for (var i=0; i<menuitems.length; i++)
        {
            var menuitem = menuitems[i];
            var button = doc.createElement("button");
            Css.setClass(button, "traceOption");
            Menu.setItemIntoElement(button, menuitem);
            button.innerHTML = menuitem.label;
            button.setAttribute("id", menuitem.pref);
            button.removeAttribute("type");
            button.addEventListener("click", menuitem.command, false);

            var tooltip = Locale.$STR("tracing.option." + menuitem.label + "_Description");
            if (tooltip)
                button.setAttribute("title", tooltip);

            optionsBody.appendChild(button);
        }
    },
};

// ********************************************************************************************* //
// Registration

return CommonBaseUI;

// ********************************************************************************************* //
});
