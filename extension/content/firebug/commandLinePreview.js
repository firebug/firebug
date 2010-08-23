/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

// ************************************************************************************************
// Implementation

/**
 * @module Command Line availability in other panels.
 */
Firebug.CommandLine.Preview = extend(Firebug.Module,
{
    lastFocused : null,
    
    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        this.setPreviewBrowserStyle(Firebug.chrome);

        this.onCommandLineKeyPress = bind(this.onCommandLineKeyPress, this);
        this.onKeyPress = bind(this.onKeyPress, this);

        this.attachListeners();
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

    shutdown: function()
    {
        Firebug.chrome.$("fbContentBox").removeEventListener("keypress", this.onKeyPress, false);
    },

    reattachContext: function(browser, context)
    {
        this.setPreviewBrowserStyle(Firebug.chrome);
        this.attachListeners();
    },

    showPanel: function(browser, panel)
    {
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Preview.showPanel; " + (panel?panel.name:"null panel"));

        var chrome = Firebug.chrome;
        var visible = this.isVisible();
        var isConsole = (panel && panel.name == "console");
        var largeCmd = Firebug.largeCommandLine;

        // Disable the console preview button (Firebug toolbar) if the Console panel
        // is disabled or selected.
        var consolePanelType = Firebug.getPanelType("console");
        var disabled = consolePanelType.prototype.isEnabled() ? "false" : "true";
        if (isConsole || !panel)
            disabled = "true";

        chrome.$("fbCommandPreviewButton").setAttribute("disabled", disabled);

        if ((largeCmd && isConsole) || !panel)
        {
            collapse(chrome.$("fbPanelSplitter"), panel ? false : true);
            collapse(chrome.$("fbSidePanelDeck"), panel ? false : true);
            collapse(chrome.$("fbCommandBox"), true);
            chrome.$("fbSidePanelDeck").selectedPanel = chrome.$("fbLargeCommandBox");
        }

        // Update visibility of the console-preview (hidden if the Console panel is selected,
        // but the console button in toolbar still indicates that the preview should be opened
        // in another panels).
        if (isConsole || !panel || disabled == "true")
        {
            collapse(chrome.$("fbCommandPreview"), true);
            collapse(chrome.$("fbCommandPreviewSplitter"), true);
            collapse(chrome.$("fbCommandBox"), largeCmd || disabled == "true");
        }
        else
        {
            this.setVisible(visible);
        }

        // Make sure the console panel is attached to the proper document
        // (the one used by all panels, or the one used by console preview and available
        // for all the panels).
        if (panel)
            this.reattach(panel.context);

        // If the the console panel is opened on another panel, simulate show event for it.
        if (panel && !isConsole && visible)
            this.showPreviewPanel(panel.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    setPreviewBrowserStyle: function(chrome)
    {
        // Set additional style so we can make the panelNode-console node
        // always visible regardless of the currently selected panel.
        var doc = chrome.$("fbCommandPreviewBrowser").contentDocument;
        var body = getBody(doc);
        setClass(body, "commandPreview");
    },

    attachListeners: function()
    {
        // Register event listeners.
        Firebug.chrome.$("fbContentBox").addEventListener("keypress", this.onKeyPress, false);
    },

    toggle: function(context)
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (panel && panel.name == "console")
            return;

        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.Preview.toggle;");

        var visible = this.isVisible();
        this.setVisible(!visible);

        this.reattach(context);

        this.showPreviewPanel(context);
    },

    showPreviewPanel: function(context)
    {
        // If the the console panel is opened on another panel, simulate show event for it.
        if (this.isVisible())
        {
            var panel = context.getPanel("console", true);
            if (panel)
            {
                var state = Firebug.getPanelState(panel);
                panel.showPanel(state);
            }
        }
    },

    setVisible: function(visible)
    {
        var chrome = Firebug.chrome;
        var preview = chrome.$("fbCommandPreview");
        var splitter = chrome.$("fbCommandPreviewSplitter")
        var cmdbox = chrome.$("fbCommandBox");
        var toggle = chrome.$("fbCommandToggleSmall");
        var cmdline = chrome.$("fbCommandLine");

        // If all the visual parts are already visible then bail out.
        if (visible && !isCollapsed(preview) && !isCollapsed(splitter) &&
            !isCollapsed(cmdbox) && !isCollapsed(toggle))
            return;

        collapse(preview, !visible);
        collapse(splitter, !visible);
        collapse(cmdbox, !visible);

        // The command line can't be multiline in other panels.
        collapse(toggle, visible);

        chrome.setGlobalAttribute("cmd_toggleCommandPreview", "checked", visible);

        // Focus the command line if it has been just displayed.
        if (visible)
        {
            this.lastFocused = document.commandDispatcher.focusedElement;
            cmdline.focus();
        }
        else if (this.lastFocused && isVisible(this.lastFocused) && typeof this.lastFocused.focus == "function") 
        {
            this.lastFocused.focus();
            this.lastFocused = null;
        }
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

        // Console doesn't have to be available (e.g. disabled)
        var panel = context.getPanel("console", true);
        if (panel)
            panel.reattach(doc);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Event Listeners

    onKeyPress: function(event)
    {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return false;

        // ESC
        var target = event.target;
        // prevent conflict with inline editors being closed
        if (target && event.keyCode == 27 && !hasClass(event.target, "textEditorInner"))
            this.toggle(Firebug.currentContext);
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.CommandLine.Preview);

// ************************************************************************************************
}});
