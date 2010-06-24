/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

// ************************************************************************************************
// Implementation

/**
 * @module Console & command line availability in other panels.
 */
Firebug.CommandLine.Preview = extend(Firebug.Module,
{
    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        // Set additional style so we can make the panelNode-console node
        // always visible regardles on the currently selected panel.
        var doc = Firebug.chrome.$("fbCommandPreviewBrowser").contentDocument;
        var body = getBody(doc);
        setClass(body, "commandPreview");
    },

    internationalizeUI: function(doc)
    {
        var elements = ["fbCommandPreviewButton"];

        for (var i=0; i<elements.length; i++)
        {
            var element = doc.getElementById(elements[i]);
            if (element.hasAttribute("label"))
                FBL.internationalize(element, "label");

            if (element.hasAttribute("tooltiptext"))
                FBL.internationalize(element, "tooltiptext");
        }
    },

    showPanel: function(browser, panel)
    {
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Preview.showPanel; " + panel.name);

        var chrome = Firebug.chrome;
        var visible = this.isVisible();
        var isConsole = (panel && panel.name == "console");
        var largeCmd = Firebug.largeCommandLine;

        if (largeCmd && isConsole)
        {
            collapse(chrome.$("fbPanelSplitter"), false);
            collapse(chrome.$("fbSidePanelDeck"), false);
            collapse(chrome.$("fbCommandBox"), true);
            chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbLargeCommandBox");
        }

        // Update visibility of the console-preview (hidden if the Console panel is selected,
        // but the console button in toolbar still indicates that the preview should be opened
        // in another panels).
        if (isConsole)
        {
            collapse(chrome.$("fbCommandPreview"), true);
            collapse(chrome.$("fbCommandPreviewSplitter"), true);
            collapse(chrome.$("fbCommandBox"), largeCmd);
        }
        else
        {
            this.setVisible(visible);
        }

        // Disable the console preview button (Firebug toolbar) if the Console panel
        // is disabled or selected.
        var consolePanelType = Firebug.getPanelType("console");
        var disabled = consolePanelType.prototype.isEnabled() ? "false" : "true";
        if (isConsole)
            disabled = "true";
        chrome.$("fbCommandPreviewButton").setAttribute("disabled", disabled);

        // Make sure the console panel is attached to the proper document
        // (the one used by all panels, or the one used by console preview and available
        // for all the panels).
        if (panel)
            this.reattach(panel.context);
    },

    toggle: function(context)
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (panel && panel.name == "console")
            return;

        var visible = this.isVisible();
        this.setVisible(!visible);

        this.reattach(context);
    },

    setVisible: function(visible)
    {
        var chrome = Firebug.chrome;
        collapse(chrome.$("fbCommandPreview"), !visible);
        collapse(chrome.$("fbCommandPreviewSplitter"), !visible);
        collapse(chrome.$("fbCommandBox"), !visible);

        // The command line can't be multiline in other panels.
        collapse(chrome.$("fbCommandToggleSmall"), visible);

        Firebug.chrome.setGlobalAttribute("cmd_toggleCommandPreview", "checked", visible);
    },

    isVisible: function()
    {
        var checked = Firebug.chrome.getGlobalAttribute("cmd_toggleCommandPreview", "checked");
        return (checked == "true") ? true : false;
    },

    reattach: function(context)
    {
        var consolePanelType = Firebug.getPanelType("console");
        var doc = Firebug.chrome.getPanelDocument(consolePanelType);

        //xxxHonza, XXXjjb: this creates the panel.
        // Console doesn't have to be available (e.g. disabled)
        var panel = context.getPanel("console");
        if (panel)
            panel.reattach(doc);
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.CommandLine.Preview);

// ************************************************************************************************
}});
