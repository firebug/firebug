/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/css",
    "firebug/chrome/module",
],
function(Firebug, FBTrace, Obj, Dom, Options, Css, Module) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_TOGGLESIDEPANELS");

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
 *
 * In order to always place the toggle button at the same location (far right of the inner
 * toolbar), we need to have two XUL buttons defined. One is inside the panel toolbar and
 * the other one is inside side-panel toolbar. Only one button is visible at a time.
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

        // Register a command handlers for XUL buttons dynamically, so we don't have to
        // expose this object into the firebugOverlay.xul scope.
        this.registerListeners();
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    /**
     * Executed by the framework when {@Chrome}.syncSidePanels is called.
     *
     * @param {@Panel} panel The currently selected main panel.
     */
    updateSidePanels: function(panel)
    {
        // If no current panel bail out (the current panel can be disabled i.e. null).
        if (!panel)
            return;

        this.updateButtonState();
        this.updateButtonVisibility();

        // Hide the toggle-side-panels button if there are no side panels
        // for the current main panel.
        var hasSidePanels = this.hasSidePanels();
        if (!hasSidePanels)
            return;

        var prefName = this.getPanelPrefName(panel);
        var currentlyVisible = this.isSideBoxVisible();

        // True preference value means hide the side panels.
        var shouldBeVisible = !Options.get(prefName);

        Trace.sysout("toggleSidePanels.updateSidePanels; panel: " + panel.name +
            " visible: " + currentlyVisible + " => " + shouldBeVisible);

        // Update visibility of the side area.
        if (currentlyVisible != shouldBeVisible)
            this.toggle();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        // Update buttons if the panel orientation has changed.
        if (name == "viewPanelOrient")
        {
            this.updateButtonState();
            this.updateButtonVisibility();
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // State

    getPanelPrefName: function(panel)
    {
        // Return preference name for given panel object.
        return panel.name + "HideSidePanels";
    },

    isSideBoxVisible: function()
    {
        var splitter = Firebug.chrome.$("fbPanelSplitter");
        return !Dom.isCollapsed(splitter);
    },

    hasSidePanels: function()
    {
        // Get list of side panels for the current main panel.
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        if (!selectedPanel)
        {
            Trace.sysout("toggleSidePanels.hasSidePanels; ");
            return;
        }

        var context = selectedPanel.context;
        var panelTypes = Firebug.getSidePanelTypes(context, selectedPanel);

        return (panelTypes.length > 0);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Command

    /**
     * Executed when the user presses 'fbToggleSidePanels' button on panel's toolbar.
     */
    toggle: function()
    {
        var splitter = Firebug.chrome.$("fbPanelSplitter");
        var panelDeck = Firebug.chrome.$("fbSidePanelDeck");

        // Get the current state (e.g. if the side panel area is visible it'll be hidden)
        var sideBoxClose = this.isSideBoxVisible();

        // Update UI (hide or show the side panel box and the splitter).
        Dom.collapse(splitter, sideBoxClose);
        Dom.collapse(panelDeck, sideBoxClose);

        Trace.sysout("toggleSidePanels.toggle; side panels visibility: " + sideBoxClose +
            " => " + this.isSideBoxVisible());

        // Update preferences
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        var prefName = this.getPanelPrefName(selectedPanel);

        Options.set(prefName, sideBoxClose);

        // Update button style (its image is changing according to the current state).
        this.updateButtonState();
        this.updateButtonVisibility();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    /**
     * Update visibility of both XUL buttons (used to toggle the side panel box).
     */
    updateButtonVisibility: function()
    {
        var sideBoxVisible = this.isSideBoxVisible();
        var hasSidePanels = this.hasSidePanels();
        var orient = Options.get("viewPanelOrient");

        Trace.sysout("toggleSidePanels.updateButtonVisibility; side box visible: " +
            sideBoxVisible + ", has side panels: " + hasSidePanels + ", orient: " + orient);

        // The panel-toolbar button is visible only if there are some side panels and
        // and the side panel box is hidden.
        var box = Firebug.chrome.$("fbToggleSidePanelsBox");
        Dom.collapse(box, !hasSidePanels || sideBoxVisible);

        // The side-panel-toolbar button is visible only if there are some side panels and
        // and the side panel box is visible.
        var box2 = Firebug.chrome.$("fbToggleSidePanelsBox2");
        Dom.collapse(box2, !hasSidePanels || !sideBoxVisible);

        // If the panel orientation is set to 'vertical' (i.e. the side panel box is displayed
        // at the bottom of the Firebug UI) the panel-toolbar button is always visible.
        if (orient)
        {
            Dom.collapse(box, false);
            Dom.collapse(box2, true);
        }
    },

    /**
     * Update visibility of both XUL buttons (used to toggle the side panel box),
     * so the proper icon is displayed.
     */
    updateButtonState: function()
    {
        var visible = this.isSideBoxVisible();

        var button = Firebug.chrome.$("fbToggleSidePanels");
        if (visible)
            Css.removeClass(button, "closed");
        else
            Css.setClass(button, "closed");

        var button2 = Firebug.chrome.$("fbToggleSidePanels2");
        if (visible)
            Css.removeClass(button2, "closed");
        else
            Css.setClass(button2, "closed");
    },

    /**
     * Register 'command' listeners for both XUL buttons in the UI.
     */
    registerListeners: function()
    {
        var button = Firebug.chrome.$("fbToggleSidePanels");
        button.addEventListener("command", this.toggle.bind(this), false);

        var button2 = Firebug.chrome.$("fbToggleSidePanels2");
        button2.addEventListener("command", this.toggle.bind(this), false);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ToggleSidePanels);

return ToggleSidePanels;

// ********************************************************************************************* //
});
