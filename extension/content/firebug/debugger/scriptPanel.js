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

Firebug.JSD2ScriptPanel = function()
{
};

var BasePanel = Firebug.ActivablePanel;
Firebug.JSD2ScriptPanel.prototype = Obj.extend(BasePanel,
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
        // XXXjjb do we need to show a blank?
        if (!compilationUnit)
            return;

        if (!(compilationUnit instanceof CompilationUnit))
        {
            FBTrace.sysout("Script panel location not a CompilationUnit: ", compilationUnit);
            throw new Error("Script panel location not a CompilationUnit: " + compilationUnit);
        }

        // Since our last use of the compilationUnit we may have compiled or
        // recompiled the source
        var updatedCompilationUnit = this.context.getCompilationUnit(compilationUnit.getURL());
        if (!updatedCompilationUnit)
            updatedCompilationUnit = this.getDefaultLocation();

        if (!updatedCompilationUnit)
            return;

        if (this.activeWarningTag)
        {
            Dom.clearNode(this.panelNode);
            delete this.activeWarningTag;

            // The user was seeing the warning, but selected a file to show in the Script panel.
            // The removal of the warning leaves the panel without a clientHeight, so
            //  the old sourcebox will be out of sync. Just remove it and start over.
            this.removeAllSourceBoxes();
            // we are not passing state so I guess we could miss a restore
            this.show();

            // If show() reset the flag, obey it
            if (this.activeWarningTag)
                return;
        }

        this.showSource(updatedCompilationUnit);

        Events.dispatch(this.fbListeners, "onUpdateScriptLocation", [this, updatedCompilationUnit]);
    },

    showSource: function(compilationUnit)
    {
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

Firebug.registerPanel(Firebug.JSD2ScriptPanel);

return Firebug.JSD2ScriptPanel;

// ********************************************************************************************* //
});