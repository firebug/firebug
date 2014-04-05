/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/chrome/module",
    "firebug/console/commandLine",
],
function(Firebug, FBTrace, Obj, Css, Dom, Locale, Options, Module, CommandLine) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_COMMANDEDITOR");

// ********************************************************************************************* //
// ToggleCommandEditor Implementation

/**
 * @module This module is responsible for toggling visibility of the Command editor.
 *
 * The Command editor should be implemented as a standard side panel, which also
 * allows to have more instances of the editor at the same time.
 *
 * See also related issues:
 * 1) Issue 988: Make the Command Editor independent from the Command Line
 * 2) Issue 6028: Allow to have multiple instances of the Command Editor
 */
var ToggleCommandEditor = Obj.extend(Module,
/** @lends ToggleCommandEditor */
{
    dispatchName: "ToggleCommandEditor",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        this.updateButtonState();
        this.updateButtonVisibility();

        // Register a command handlers for XUL buttons dynamically, so we don't have to
        // expose this object into the firebugOverlay.xul scope.
        this.registerListeners();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Framework Events

    showPanel: function(browser, panel)
    {
        if (panel && panel.name == "console")
            this.updateButtonVisibility();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        if (name == "viewPanelOrient" || name == "commandEditor")
        {
            this.updateButtonState();
            this.updateButtonVisibility();
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Command

    /**
     * Executed when the user presses 'fbToggleCommandEditor' or 'fbToggleCommandEditor2'
     * button on the toolbar.
     */
    toggle: function()
    {
        if (Trace.active)
        {
            var editorVisible = Options.get("commandEditor");
            Trace.sysout("toggleCommandEditor.toggle; prev value: " + editorVisible);
        }

        Options.togglePref("commandEditor");

        Firebug.chrome.focus();

        // xxxHonza: we should not be using Firebug.currentContext global.
        var context = Firebug.currentContext;
        CommandLine.getCommandLine(context).focus();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    /**
     * Update visibility of XUL buttons.
     */
    updateButtonVisibility: function()
    {
        var editorVisible = Options.get("commandEditor");
        var orient = Options.get("viewPanelOrient");

        Trace.sysout("toggleCommandEditor.updateButtonVisibility; editor visible: " +
            editorVisible + ", orient: " + orient);

        var box = Firebug.chrome.$("fbToggleCommandEditorBox");
        Dom.collapse(box, editorVisible);

        var box2 = Firebug.chrome.$("fbToggleCommandEditor2");
        Dom.collapse(box2, !editorVisible);

        if (orient)
        {
            Dom.collapse(box, false);
            Dom.collapse(box2, true);
        }
    },

    /**
     * Update state of XUL buttons, so the proper icon is displayed.
     */
    updateButtonState: function()
    {
        var editorVisible = Options.get("commandEditor");

        Trace.sysout("toggleCommandEditor.updateButtonState; editor visible: " +
            editorVisible);

        var button = Firebug.chrome.$("fbToggleCommandEditor");
        if (editorVisible)
            Css.removeClass(button, "closed");
        else
            Css.setClass(button, "closed");

        var button2 = Firebug.chrome.$("fbToggleCommandEditor2");
        if (editorVisible)
            Css.removeClass(button2, "closed");
        else
            Css.setClass(button2, "closed");
    },

    /**
     * Register listeners for XUL UI. This module is not exposed to the XUL space.
     */
    registerListeners: function()
    {
        var button = Firebug.chrome.$("fbToggleCommandEditor");
        button.addEventListener("command", this.toggle.bind(this), false);

        var button2 = Firebug.chrome.$("fbToggleCommandEditor2");
        button2.addEventListener("command", this.toggle.bind(this), false);

        var tooltip = Firebug.chrome.$("fbToggleCommandEditorTooltip");
        tooltip.addEventListener("popupshowing",
            this.onToggleCommandEditorShowTooltip.bind(this, tooltip), false);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tooltips

    onToggleCommandEditorShowTooltip: function(tooltip)
    {
        // fbToggleCommandEditor buttons is displayed all the time in case of
        // |Vertical Panes| mode. So, update its tooltip according to the
        // current visibility of the Command Editor.
        var editorVisible = Options.get("commandEditor");
        tooltip.label = editorVisible ? Locale.$STR("console.option.Show_Command_Line") :
            Locale.$STR("console.option.Show_Command_Editor");
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ToggleCommandEditor);

return ToggleCommandEditor;

// ********************************************************************************************* //
});
