/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/debugger/debuggerClient",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/debugger/scriptView",
    "arch/compilationunit",
],
function (Obj, DebuggerClient, Locale, Events, ScriptView, CompilationUnit) {

// ********************************************************************************************* //
// Script panel

Firebug.JSD2.ScriptPanel = function()
{
};

var BasePanel = Firebug.ActivablePanel;
Firebug.JSD2.ScriptPanel.prototype = Obj.extend(BasePanel,
{
    dispatchName: "JSD2.ScriptPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "jsd2script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 45,

    initialize: function(context, doc)
    {
        BasePanel.initialize.apply(this, arguments);

        this.panelSplitter = Firebug.chrome.$("fbPanelSplitter");
        this.sidePanelDeck = Firebug.chrome.$("fbSidePanelDeck");

        Firebug.connection.addListener(this);

        this.scriptView = new ScriptView();
        this.scriptView.initialize(this.panelNode);

        FBTrace.sysout("JSD2ScriptPanel.initialize;");
    },

    destroy: function(state)
    {
        Firebug.connection.removeListener(this);

        BasePanel.destroy.apply(this, arguments);

        this.debuggerClient.detach(function()
        {
            FBTrace.sysout("ScriptPanel.destroy; Debugger detached");
        });

        this.scriptView.destroy();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(browser)
    {
        FBTrace.sysout("JSD2ScriptPanel.onConnect;");

        this.debuggerClient = new DebuggerClient(this.context, browser.connection);
        this.debuggerClient.attach(function()
        {
            FBTrace.sysout("ScriptPanel.initialize; Debugger attached");
        });
    },

    onDisconnect: function()
    {
        FBTrace.sysout("JSD2ScriptPanel.onDisconnect;");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivablePanel

    onActivationChanged: function(enable)
    {
        if (enable)
        {
            Firebug.JSD2.Debugger.addObserver(this);
            Firebug.TabCacheModel.addObserver(this);
        }
        else
        {
            Firebug.JSD2.Debugger.removeObserver(this);
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
        return this.context.getAllCompilationUnits();
    },

    getDefaultLocation: function()
    {
        var compilationUnits = this.getLocationList();
        if (!compilationUnits.length)
            return null;

        return compilationUnits[0];
    },

    getObjectLocation: function(compilationUnit)
    {
        return compilationUnit.getURL();
    },

    updateLocation: function(compilationUnit)
    {
        this.showSource(compilationUnit);

        Events.dispatch(this.fbListeners, "onUpdateScriptLocation",
            [this, compilationUnit]);
    },

    showSource: function(compilationUnit)
    {
        if (!compilationUnit)
            compilationUnit = this.getDefaultLocation();

        if (!compilationUnit)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("scriptPanel.showSource; ERROR no compilation unit!");
            return;
        }

        var self = this;
        function callback(unit, firstLineNumber, lastLineNumber, lines)
        {
            self.scriptView.showSource(lines.join(""));
        }

        compilationUnit.getSourceLines(-1, -1, callback);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.JSD2.ScriptPanel);

return Firebug.JSD2.ScriptPanel;

// ********************************************************************************************* //
});