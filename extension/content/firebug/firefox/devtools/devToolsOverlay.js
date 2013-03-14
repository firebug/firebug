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

        this.createFirebugPanel();
    },

    createFirebugPanel: function()
    {
        var self = this;
        var firebugPanelDefinition =
        {
            id: "firebug",
            ordinal: 10,
            killswitch: "firebug.devtools.enabled",
            label: Locale.$STR("devtools.Firebug"),
            icon: "chrome://firebug/skin/firebug.png",
            tooltip: Locale.$STR("devtools.Firebug"),
            url: "chrome://firebug/content/firefox/devtools/firebugPanel.xul",

            isTargetSupported: function(target)
            {
                return target.isLocalTab;
            },

            build: function(frame, target)
            {
                self.firebugPanel = new DevToolsFirebugPanel(frame, target);
                return self.firebugPanel.open(self.win);
            }
       };

       gDevTools.registerTool(firebugPanelDefinition);
    },
};

// ********************************************************************************************* //
// Registration

return DevToolsOverlay;

// ********************************************************************************************* //
});
