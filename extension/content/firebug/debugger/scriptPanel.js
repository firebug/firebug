/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/debugger/debuggerClient",
    "firebug/lib/locale",
],
function (Obj, Firebug, DebuggerClient, Locale) {

// ********************************************************************************************* //
// Script panel

Firebug.JSD2ScriptPanel = function() {};

Firebug.JSD2ScriptPanel.prototype = Obj.extend(Firebug.SourceBoxPanel,
{
    dispatchName: "JSD2ScriptPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "jsd2script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 45,

    initialize: function(context, doc)
    {
        Firebug.SourceBoxPanel.initialize.apply(this, arguments);

        this.panelSplitter = Firebug.chrome.$("fbPanelSplitter");
        this.sidePanelDeck = Firebug.chrome.$("fbSidePanelDeck");

        Firebug.connection.addListener(this);

        FBTrace.sysout("JSD2ScriptPanel.initialize;");
    },

    destroy: function(state)
    {
        Firebug.connection.removeListener(this);

        Firebug.SourceBoxPanel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(browser)
    {
        FBTrace.sysout("JSD2ScriptPanel.onConnect;");

        this.debuggerClient = new DebuggerClient(browser.connection);
        this.debuggerClient.attach(function()
        {
            FBTrace.sysout("ScriptPanel.initialize; Debugger attached!");
        });
    },

    onDisconnect: function()
    {
        this.debuggerClient.detach();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivablePanel

    onActivationChanged: function(enable)
    {
        if (enable)
        {
            Firebug.JSD2Debugger.addObserver(this);
            Firebug.TabCacheModel.addObserver(this);
        }
        else
        {
            Firebug.JSD2Debugger.removeObserver(this);
            Firebug.TabCacheModel.removeObserver(this);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panel show/hide

    show: function(state)
    {
        var enabled = this.isEnabled();
        if (!enabled)
            return;

        var active = true;

        // These buttons are visible only, if debugger is enabled.
        this.showToolbarButtons("fbLocationSeparator", active);
        this.showToolbarButtons("fbDebuggerButtons", active);
        this.showToolbarButtons("fbLocationButtons", active);
        this.showToolbarButtons("fbScriptButtons", active);
        this.showToolbarButtons("fbStatusButtons", active);

        Firebug.chrome.$("fbRerunButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Rerun"), "Shift+F8"]));
        Firebug.chrome.$("fbContinueButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Continue"), "F8"]));
        Firebug.chrome.$("fbStepIntoButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Into"), "F11"]));
        Firebug.chrome.$("fbStepOverButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Over"), "F10"]));
        Firebug.chrome.$("fbStepOutButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut",
                [Locale.$STR("script.Step_Out"), "Shift+F11"]));

        // Additional debugger panels are visible only, if debugger is active.
        this.panelSplitter.collapsed = !active;
        this.sidePanelDeck.collapsed = !active;
    },

    hide: function(state)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Location List

    getLocationList: function()
    {
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.JSD2ScriptPanel);

return Firebug.JSD2ScriptPanel;

// ********************************************************************************************* //
});