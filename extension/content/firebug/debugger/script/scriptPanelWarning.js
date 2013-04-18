/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/options",
    "firebug/lib/dom",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/chrome/tabWatcher",
    "firebug/chrome/reps",
    "firebug/chrome/window",
    "firebug/chrome/firefox",
],
function(Firebug, FBTrace, Obj, Domplate, Options, Dom, Url, Locale, TabWatcher,
    FirebugReps, Win, Firefox) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_SCRIPTPANELWARNING");

// ********************************************************************************************* //
// Warning Template

/**
 * @domplate Displays various warning messages within the Script panel.
 */
var WarningRep = domplate(Firebug.Rep,
/** @lends WarningRep */
{
    tag:
        DIV({"class": "disabledPanelBox"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                SPAN("$suggestion")
            )
        ),

    enableScriptTag:
        SPAN({"class": "objectLink", onclick: "$onEnableScript", style: "color: blue"},
            Locale.$STR("script.button.enable_javascript")
        ),

    focusDebuggerTag:
        SPAN({"class": "objectLink", onclick: "$onFocusDebugger", style: "color: blue"},
            Locale.$STR("script.button.Go to that page")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onEnableScript: function(event)
    {
        Options.setPref("javascript", "enabled", true);

        TabWatcher.reloadPageFromMemory(Firebug.currentContext);
    },

    onFocusDebugger: function(event)
    {
        Win.iterateBrowserWindows(null, function(win)
        {
            Trace.sysout("scriptPanelWarning.onFocusDebugger; win: " +
                Win.safeGetWindowLocation(win));

            return win.Firebug.TabWatcher.iterateContexts(function(context)
            {
                if (context.stopped)
                {
                    // Focus browser window with active debugger and select the Script panel
                    win.Firebug.focusBrowserTab(context.window);
                    win.Firebug.chrome.selectPanel("script");
                    return true;
                }
            });
        });

        // No context is stopped
        TraceError.sysout("scriptPanelWarning.onFocusDebugger; ERROR no window found!");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showInactive: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.inactive_during_page_load"),
            suggestion: Locale.$STR("script.suggestion.inactive_during_page_load2")
        };

        var box = this.tag.replace(args, parentNode, this);
        var description = box.getElementsByClassName("disabledPanelDescription").item(0);

        FirebugReps.Description.render(args.suggestion, description,
            Obj.bindFixed(TabWatcher.reloadPageFromMemory, TabWatcher,
            Firebug.currentContext));

        return box;
    },

    showNotEnabled: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.javascript_not_enabled"),
            suggestion: Locale.$STR("script.suggestion.javascript_not_enabled")
        };

        var box = this.tag.replace(args, parentNode, this);
        this.enableScriptTag.append({}, box, this);

        return box;
    },

    showDebuggerInactive: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.debugger_not_activated"),
            suggestion: Locale.$STR("script.suggestion.debugger_not_activated")
        };

        var box = this.tag.replace(args, parentNode, this);

        return box;
    },

    showFiltered: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.all_scripts_filtered"),
            suggestion: Locale.$STR("script.suggestion.all_scripts_filtered")
        };
        return this.tag.replace(args, parentNode, this);
    },

    showNoScript: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.no_javascript"),
            suggestion: Locale.$STR("script.suggestion.no_javascript2")
        };
        return this.tag.replace(args, parentNode, this);
    },

    showNoDebuggingForSystemSources: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.no_system_source_debugging"),
            suggestion: Locale.$STR("script.suggestion.no_system_source_debugging")
        };

        var box = this.tag.replace(args, parentNode, this);
        var description = box.getElementsByClassName("disabledPanelDescription").item(0);

        FirebugReps.Description.render(args.suggestion, description,
            Obj.bindFixed(Firebug.chrome.visitWebsite, this, "issue5110"));

        return box;
    },

    showActivitySuspended: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.debugger_active"),
            suggestion: Locale.$STR("script.suggestion.debugger_active")
        };

        var box = this.tag.replace(args, parentNode, this);
        this.focusDebuggerTag.append({}, box, this);

        return box;
    }
});

// ********************************************************************************************* //
// Implementation

var ScriptPanelWarning =
{
    updateLocation: function(panel)
    {
        if (!panel.activeWarningTag)
            return false;

        panel.scriptView.destroy();

        Dom.clearNode(panel.panelNode);
        delete panel.activeWarningTag;

        panel.show();

        // If show() reset the flag, obey it
        return (panel.activeWarningTag != null);
    },

    showWarning: function(panel)
    {
        // xxxHonza: the following flags are probably obsolete
        // context.jsDebuggerCalledUs
        // Firebug.jsDebuggerOn
        // context.activitySuspended

        // Fill the panel node with a warning if needed
        var location = panel.getDefaultLocation();
        var jsEnabled = Options.getPref("javascript", "enabled");

        Trace.sysout("scriptPanelWarning.showWarning; " + panel.context.getName(), {
            jsDebuggerOn: Firebug.jsDebuggerOn,
            jsDebuggerCalledUs: panel.context.jsDebuggerCalledUs,
            jsEnabled: jsEnabled,
            location: location,
            activitySuspended: panel.context.activitySuspended,
            stopped: panel.context.stopped,
            allScriptsWereFiltered: panel.context.allScriptsWereFiltered
        });

        var currentURI = Firefox.getCurrentURI();
        var activitySuspended = this.isActivitySuspended();
        if (activitySuspended && !panel.context.stopped)
        {
            // Make sure that the content of the panel is restored as soon as
            // the debugger is resumed.
            panel.restored = false;
            panel.activeWarningTag = WarningRep.showActivitySuspended(panel.panelNode);
        }
        else if (!jsEnabled)
        {
            panel.activeWarningTag = WarningRep.showNotEnabled(panel.panelNode);
        }
        else if (currentURI && (Url.isSystemURL(currentURI.spec) ||
            currentURI.spec.match(Url.reChrome)))
        {
            panel.activeWarningTag = WarningRep.showNoDebuggingForSystemSources(panel.panelNode);
        }
        else if (panel.context.allScriptsWereFiltered)
        {
            panel.activeWarningTag = WarningRep.showFiltered(panel.panelNode);
        }
        /*else if (location && !panel.context.jsDebuggerCalledUs)
        {
            panel.activeWarningTag = WarningRep.showInactive(panel.panelNode);
        }
        else if (!Firebug.jsDebuggerOn)  // set asynchronously by jsd in FF 4.0
        {
            panel.activeWarningTag = WarningRep.showDebuggerInactive(panel.panelNode);
        }*/
        else if (!location) // they were not filtered, we just had none
        {
            panel.activeWarningTag = WarningRep.showNoScript(panel.panelNode);
        }
        else
        {
            return false;
        }

        return true;
    },

    isActivitySuspended: function()
    {
        return Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            // Firebug doesn't have to be loaded in every browser window (see delayed load).
            if (!win.Firebug.TabWatcher)
                return false;

            return win.Firebug.TabWatcher.iterateContexts(function(context)
            {
                if (context.stopped)
                    return true;
            });
        });
    },
}

// ********************************************************************************************* //
// Registration

return ScriptPanelWarning;

// ********************************************************************************************* //
}});
