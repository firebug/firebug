/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/firefox/devtools/devToolsFirebugPanel",
    "firebug/firefox/browserOverlayLib",
],
function(FBTrace, Options, Locale, DevToolsFirebugPanel, BrowserOverlayLib) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

const gDevTools = Cu.import("resource:///modules/devtools/gDevTools.jsm", {}).gDevTools;

var {$stylesheet, $el} = BrowserOverlayLib;

// Import CommandUtils object
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CommandUtils",
    "resource:///modules/devtools/DeveloperToolbar.jsm");

// ********************************************************************************************* //
// DevToolsOverlay Implementation

function DevToolsOverlay(win)
{
    this.win = win;
}

DevToolsOverlay.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(reason)
    {
        FBTrace.sysout("devToolsOverlay.initialize;");

        // Register event handlers
        gDevTools.on("toolbox-ready", this.onToolboxReady.bind(this));

        // Register a new panel
        //this.createFirebugPanel();
        this.createFirebugButton();
        this.createGcliButton();
    },

    createFirebugPanel: function()
    {
        var self = this;
        var firebugPanelDefinition =
        {
            id: "firebug",
            ordinal: -10,
            killswitch: "firebug.devtools.enabled",
            label: Locale.$STR("devtools.Firebug"),
            icon: "chrome://firebug/skin/firebug.png",
            tooltip: Locale.$STR("devtools.Firebug"),
            url: "chrome://firebug/content/firefox/devtools/firebugPanel.xul",

            isTargetSupported: function(target)
            {
                return target.isLocalTab;
            },

            build: function(frame, toolbox)
            {
                self.firebugPanel = new DevToolsFirebugPanel(frame, toolbox);
                return self.firebugPanel.open(self.win);
            }
       };

       gDevTools.registerTool(firebugPanelDefinition);
    },

    createFirebugButton: function()
    {
        // Do not customize the Developer toolbar twice.
        if (Options.get("devToolbarCustomizationDone"))
            return;

        var toolbarSpec = CommandUtils.getCommandbarSpec("devtools.toolbox.toolbarSpec");

        // Do not create second Firebug button.
        if (toolbarSpec.indexOf("firebug open") >= 0)
            return;

        // Insert Firebug button ID into the array and store in preferences.
        // The button will appear inside the toolbox toolbar.
        toolbarSpec.unshift("firebug open");
        Options.setPref("devtools", "toolbox.toolbarSpec", toolbarSpec.toSource());
    },

    createGcliButton: function()
    {
        // Insert Firebug button (to open Firebug UI) into GCLI (Developer toolbar)
        var doc = this.win.document;
        var parentToolbar = doc.getElementById("developer-toolbar");
        $el(doc, "toolbarbutton", {
            position: 2,
            "class": "developer-toolbar-button",
            id: "developer-toolbar-firebug-button",
            tooltiptext: "Firebug",
            command: "cmd_firebug_toggleFirebug",
        }, [], parentToolbar);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onToolboxReady: function(type, toolbox)
    {
        if (FBTrace.DBG_DEVTOOLS) 
            FBTrace.sysout("devToolsOverlay.onToolboxReady;", toolbox);

        // Developer toolbox lives inside an iframe, so in order to set custom styles
        // we need to append them into the iframe.
        var node = $stylesheet(toolbox.doc,
            "chrome://firebug/content/firefox/devtools/devToolsOverlay.css");

        // If Firebug UI is opened when the toolbox is opened, hide Firebug since it's
        // available within the toolbox UI. Hide it only if the Firebug panel doesn't exist
        // yet, otherwise the panel would be empty.
        var panel = toolbox.getPanel("firebug");
        if (!panel && this.win.Firebug.isInitialized)
            this.win.Firebug.minimizeBar();
    }
};

// ********************************************************************************************* //
// Registration

return DevToolsOverlay;

// ********************************************************************************************* //
});
