/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerLib",
],
function(Firebug, FBTrace, Obj, Module, DebuggerLib) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SCRIPTPANELLINEUPDATER");

// 12 October 1492 Christopher Columbus discovers America
var delay = 1492;

// ********************************************************************************************* //
// ScriptPanelLineUpdater Implementation

/**
 * @Module This module is responsible for regular update of executable lines (the green numbers
 * displayed in the left hand side column). Scripts that are not rooted can be garbage collected
 * and this updater ensures that the line-column is up to date.
 * 
 * 1) The updater is active only if the Script panel is currently displayed.
 * 2) The updater updates only visible lines (viewport)
 *
 * xxxHonza: the updater can be probably removed as soon as the following platform bugs are fixed:
 * (see also issue 6948):
 * https://bugzilla.mozilla.org/show_bug.cgi?id=944258
 * https://bugzilla.mozilla.org/show_bug.cgi?id=944260
 */
var ScriptPanelLineUpdater = Obj.extend(Module,
/** @lends ScriptPanelLineUpdater */
{
    dispatchName: "ScriptPanelLineUpdater",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    onShowPanel: function(panel)
    {
        if (panel.name != "script")
            return;

        this.startExecutableLinesUpdate(panel);
    },

    onHidePanel: function(panel)
    {
        if (panel.name != "script")
            return;

        this.stopExecutableLinesUpdate(panel);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Updater

    startExecutableLinesUpdate: function(panel)
    {
        if (panel.executableLineUpdater)
            return;

        // The life of the updater is limited.
        panel.executableLineUpdaterCounter = 7;
        panel.executableLineUpdater = panel.context.setInterval(
            this.onUpdateExecutableLines.bind(this, panel), delay);

        Trace.sysout("scriptPanelLineUpdater.startExecutableLinesUpdate;");
    },

    stopExecutableLinesUpdate: function(panel)
    {
        if (!panel.executableLineUpdater)
            return;

        panel.context.clearInterval(panel.executableLineUpdater);
        panel.executableLineUpdater = null;
        panel.executableLineUpdaterCounter = 0;

        Trace.sysout("scriptPanelLineUpdater.stopExecutableLinesUpdate;");
    },

    onUpdateExecutableLines: function(panel)
    {
        // The interval will execute only N times. If a script is not GCed in that period
        // of time, then it probably never will be, so we don't need to update the UI
        // for ever. There might be exceptions (removing globals that make a script not rooted),
        // but probably not often.
        if (panel.executableLineUpdaterCounter-- <= 0)
        {
            this.stopExecutableLinesUpdate(panel);
            return;
        }

        var editor = panel.scriptView.editor;
        if (!editor)
            return;

        var editorObject = editor.editorObject;
        if (!editorObject)
            return;

        var viewport = editorObject.getViewport();
        var currentLine = viewport.from;

        Trace.sysout("scriptPanelLineUpdater.onUpdateExecutableLines; from: " +
            viewport.from + ", to: " + viewport.to + " (" +
            panel.executableLineUpdaterCounter + ")");

        // Iterate over all visible lines.
        editorObject.eachLine(viewport.from, viewport.to, function(handle)
        {
            currentLine++;

            // Check if the line is executable (performance expensive operation).
            handle.executableLine = DebuggerLib.isExecutableLine(panel.context, {
                url: panel.getCurrentURL(),
                line: currentLine,
            });

            // Update line executable style.
            if (handle.executableLine)
                editorObject.addLineClass(handle, "executable", "CodeMirror-executableLine");
            else
                editorObject.removeLineClass(handle, "executable", "CodeMirror-executableLine");
        });
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ScriptPanelLineUpdater);

return ScriptPanelLineUpdater;

// ********************************************************************************************* //
});
