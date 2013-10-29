/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/css",
],
function(Firebug, Module, Obj, FBTrace, Dom, Options, Css) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// ToggleSidePanels Implementation

/**
 * @module Implements 'Toggle Side Panels' feature that is available on panel's toolbar.
 * Visibility of the side-panel-area is panel specific. So, if the user hides it e.g. for
 * the HTML panel it applies to the HTML panel only.
 *
 * Visibility is toggled by 'fbToggleSidePanels' button that is created
 * in firebugOverlay.xul
 *
 * Visibility is persisted across Firefox restarts and stored in preferences. All Firebug
 * side panels are visible by default. Preference names are generated according to the
 * main panel name |panel.name|. For example, the HTML panel is using:
 * extensions.firebug.htmlHideSidePanels (false by default or non existing)
 *
 * Side panels visibility is updated upon 'updateSidePanels' event fired to all
 * UI listeners by Firebug chrome object.
 */
var ToggleSidePanels = Obj.extend(Module,
/** @lends ToggleSidePanels */
{
    dispatchName: "ToggleSidePanels",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        // Register as a listener for 'updateSidePanels' event. 
        Firebug.registerUIListener(this);

        // Register a command handler dynamically, so we don't have to
        // expose this object into the firebugOverlay.xul scope.
        var button = Firebug.chrome.$("fbToggleSidePanels");
        button.addEventListener("command", this.toggle.bind(this), false);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    updateSidePanels: function(panel)
    {
        // If no current panel bail out (the current panel can be disabled i.e. null).
        if (!panel)
            return;

        var context = panel.context;

        // Get list of side panels for the current main panel.
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        var panelTypes = Firebug.getSidePanelTypes(context, selectedPanel);

        // Hide the toggle-side-panels button if there are no side panels
        // for the current main panel.
        var hasSidePanels = (panelTypes.length > 0);
        var box = Firebug.chrome.$("fbToggleSidePanelsBox");
        Dom.collapse(box, !hasSidePanels);

        if (!hasSidePanels)
            return;

        var prefName = this.getPanelPrefName(panel);
        var currentlyVisible = this.isVisible();

        // True preference value means hide the side panels.
        var shouldBeVisible = !Options.get(prefName);

        // Update visibility of the side area.
        if (currentlyVisible != shouldBeVisible)
            this.toggle();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // State

    getPanelPrefName: function(panel)
    {
        // Return preference name for given panel object.
        return panel.name + "HideSidePanels";
    },

    isVisible: function()
    {
        var splitter = Firebug.chrome.$("fbPanelSplitter");
        return !Dom.isCollapsed(splitter);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Command

    /**
     * Executed when the user presses 'fbToggleSidePanels' button on panel's toolbar.
     *
     * @event XULCommandEvent
     */
    toggle: function(event)
    {
        var splitter = Firebug.chrome.$("fbPanelSplitter");
        var panelDeck = Firebug.chrome.$("fbSidePanelDeck");

        // Get the current state (e.g. if the side panel area is visible it'll be hidden)
        var hide = this.isVisible();

        // Update UI
        Dom.collapse(splitter, hide);
        Dom.collapse(panelDeck, hide);

        // Update preferences
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        var prefName = this.getPanelPrefName(selectedPanel);
        Options.set(prefName, hide);

        // Update button style (its image is changing according to the current state).
        var button = Firebug.chrome.$("fbToggleSidePanels");
        if (hide)
            Css.setClass(button, "closed");
        else
            Css.removeClass(button, "closed");
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ToggleSidePanels);

return ToggleSidePanels;

// ********************************************************************************************* //
});
