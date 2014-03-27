/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/chrome/panelActivation",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/array",
    "firebug/chrome/menu",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/editor/editor",
    "firebug/console/autoCompleter",
],
function(Obj, FBTrace, Firebug, PanelActivation, Locale, Events, Dom, Arr, Menu, BreakpointStore) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKPOINTMODULE");

// ********************************************************************************************* //
// Breakpoints

/**
 * @module
 */
var BreakpointModule = Obj.extend(Firebug.Module,
/** @lends BreakpointModule */
{
    dispatchName: "BreakpointModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.connection.addListener(this);
    },

    shutdown: function()
    {
        Firebug.connection.removeListener(this);
    },

    initContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.addListener(this);
    },

    destroyContext: function(context, persistedState)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BON

    showPanel: function(browser, panel)
    {
        this.updatePanelState(panel);
    },

    onDebuggerEnabled: function()
    {
        var panel = Firebug.chrome.getSelectedPanel();
        this.updatePanelState(panel);
    },

    updatePanelState: function(panel)
    {
        // there is no selectedPanel?
        if (!panel)
            return;

        var breakButton = Firebug.chrome.$("fbBreakOnNextButton");
        if (panel.name)
            breakButton.setAttribute("panelName", panel.name);

        breakButton.removeAttribute("type");
        Dom.collapse(Firebug.chrome.$("fbBonButtons"), !panel.breakable);

        // The script panel can be created at this moment (the second parameter is false)
        // It's needed for break on next to work (do not wait till the user actually
        // selects the panel).
        var scriptPanel = panel.context.getPanel("script");
        var scriptEnabled = scriptPanel && scriptPanel.isEnabled();
        var tool = Firebug.connection.getTool("script");

        // xxxHonza: when JSD2 is not active?
        var scriptActive = true;//tool && tool.getActive();
        var supported = panel.supportsBreakOnNext();

        // Enable by default and disable if needed.
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "disabled", null);

        // Disable BON if script is disabled or if BON isn't supported by the current panel.
        if (!scriptEnabled || !scriptActive || !supported)
        {
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", "disabled");
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "disabled", "true");
            this.updateBreakOnNextTooltips(panel);
            return;
        }

        // Set the tooltips and update break-on-next button's state.
        var shouldBreak = panel.shouldBreakOnNext();
        this.updateBreakOnNextState(panel, shouldBreak);
        this.updateBreakOnNextTooltips(panel);
        this.updatePanelTab(panel, shouldBreak);

        var menuItems = panel.getBreakOnMenuItems();
        if (!menuItems || !menuItems.length)
            return;

        breakButton.setAttribute("type", "menu-button");

        var menuPopup = Firebug.chrome.$("fbBreakOnNextOptions");
        Dom.eraseNode(menuPopup);

        for (var i=0; i<menuItems.length; ++i)
            Menu.createMenuItem(menuPopup, menuItems[i]);
    },

    updateBreakOnNextTooltips: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable");

        // Get proper tooltip for the break-on-next button from the current panel.
        // If breakable is set to "false" the feature is already activated (throbbing).
        var armed = (breakable == "false");
        var tooltip = panel.getBreakOnNextTooltip(armed);
        if (!tooltip)
            tooltip = "";

        // The user should know that BON is disabled if the Script panel (debugger) is disabled.
        if (breakable == "disabled")
            tooltip += " " + Locale.$STR("firebug.bon.scriptPanelNeeded");

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "tooltiptext", tooltip);
    },

    updateBreakOnNextState: function(panel, armed)
    {
        // If the panel should break at the next chance, set the button to not breakable,
        // which means already active (throbbing).
        var breakable = armed ? "false" : "true";
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", breakable);

        // Set the button as 'checked', so it has visual border (see issue 6567).
        var checked = armed ? "true" : "false";
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "checked", checked);
    },

    updatePanelTab: function(panel, armed)
    {
        if (!panel)
            return;

        // If the script panels is disabled, BON can't be active.
        if (!PanelActivation.isPanelEnabled("script"))
            armed = false;

        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(panel.name);
        if (tab)
            tab.setAttribute("breakOnNextArmed", armed ? "true" : "false");
    },

    updatePanelTabs: function(context)
    {
        if (!context)
            return;

        var panelTypes = Firebug.getMainPanelTypes(context);
        for (var i=0; i<panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            var panel = context.getPanel(panelType.prototype.name);
            var shouldBreak = (panel && panel.shouldBreakOnNext()) ? true : false;
            this.updatePanelTab(panel, shouldBreak);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        if (name == "showBreakNotification")
        {
            var panelBar1 = Firebug.chrome.$("fbPanelBar1");
            var doc = panelBar1.browser.contentDocument;
            var checkboxes = doc.querySelectorAll(".doNotShowBreakNotification");

            for (var i=0; i<checkboxes.length; i++)
                checkboxes[i].checked = !value;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    shouldBreakDebugger: function(context, event, packet)
    {
        var type = packet.why.type;
        var tool = context.getTool("debugger");

        Trace.sysout("breakpointModule.shouldBreakDebugger;", packet);

        // If paused by a breakpoint, evaluate optional condition expression.
        if (type == "breakpoint")
        {
            var location = packet.frame.where;
            var bp = BreakpointStore.findBreakpoint(location.url, location.line - 1);

            // xxxHonza: hack, breakpoints in dynamic scripts are using different URLs., fix me.
            if (!bp)
            {
                TraceError.sysout("breakpointModule.shouldBreakDebugger; " +
                    "Paused on a breakpoint, but there is no such breakpoint.", location);
                return true;
            }

            // If there is normal disabled breakpoint, do not break.
            if (bp.isNormal() && bp.isDisabled())
            {
                Trace.sysout("breakpointModule.paused; Do not break on disabled breakpoint", bp);
                return false;
            }

            // Evaluate optional condition
            if (bp.condition)
            {
                Trace.sysout("breakpointModule.paused; on conditional breakpoint: " +
                    bp.condition, bp);

                // xxxHonza: the condition-eval could be done server-side
                // see: https://bugzilla.mozilla.org/show_bug.cgi?id=812172
                //
                // For now, Firebug modifies the server side BreakpointActor
                // See: {@link module:firebug/debugger/actors/breakpointActor}
                //
                // tool.eval(context.currentFrame, bp.condition);
                // context.conditionalBreakpointEval = true;
                // return false;

                return true;
            }
        }

        // Resolve evaluated breakpoint condition expression (if there is one in progress).
        if (type == "clientEvaluated" && context.conditionalBreakpointEval)
        {
            context.conditionalBreakpointEval = false;

            var result = packet.why.frameFinished["return"];

            Trace.sysout("breakpointModule.paused; Breakpoint condition evaluated: " +
                result, result);

            // Resume debugger if the breakpoint condition evaluation is false
            if (!result || tool.isFalse({value: result}))
                return false;
        }

        // Yeah, please break into the debugger.
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // supports non-JS break on next

    breakNow: function(panel)
    {
        this.updatePanelTab(panel, false);
        Firebug.Debugger.breakNow(panel.context);  // TODO BTI
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(BreakpointModule);

Firebug.Breakpoint = BreakpointModule;

return BreakpointModule;

// ********************************************************************************************* //
});
