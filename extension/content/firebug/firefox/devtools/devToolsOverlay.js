/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/firefox/devtools/devToolsFirebugPanel",
],
function(FBTrace, Options, Locale, DevToolsFirebugPanel) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

const gDevTools = Cu.import("resource:///modules/devtools/gDevTools.jsm", {}).gDevTools;

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
        this.createFirebugPanel();
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onToolboxReady: function(type, toolbox)
    {
        if (FBTrace.DBG_DEVTOOLS) 
            FBTrace.sysout("devToolsOverlay.onToolboxReady;", toolbox);

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
