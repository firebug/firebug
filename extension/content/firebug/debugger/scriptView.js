/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/trace",
    "firebug/lib/object",
],
function (FBTrace, Obj) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// Introduced in Firefox 8
Cu["import"]("resource:///modules/source-editor.jsm");

// ********************************************************************************************* //
// Source View

function ScriptView()
{
    this.editor = null;
}

ScriptView.prototype = Obj.extend(new Firebug.EventSource(),
{
    dispatchName: "ScriptView",
    initialized: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(parentNode)
    {
        this.onContextMenuListener = this.onContextMenu.bind(this);
        this.onBreakpointChangeListener = this.onBreakpointChange.bind(this);

        var config = {
            mode: SourceEditor.MODES.JAVASCRIPT,
            showLineNumbers: true,
            readOnly: true,
            showAnnotationRuler: true,
            showOverviewRuler: true,
            theme: "chrome://firebug/skin/orion-firebug.css",
        };

        this.editor = new SourceEditor();
        this.editor.init(parentNode, config, this.onEditorLoad.bind(this));

        this.editor._iframe.style.width = "100%";
        this.editor._iframe.style.height = "100%";
    },

    onEditorLoad: function()
    {
        this.initialized = true;

        // Add editor listeners
        this.editor.addEventListener(SourceEditor.EVENTS.CONTEXT_MENU,
            this.onContextMenuListener);
        this.editor.addEventListener(SourceEditor.EVENTS.BREAKPOINT_CHANGE,
            this.onBreakpointChangeListener);

        // Focus so, keyboard works as expected.
        this.editor.focus();

        if (this.defaultSource)
            this.showSource(this.defaultSource);
    },

    destroy: function()
    {
        this.editor.addEventListener(SourceEditor.EVENTS.CONTEXT_MENU,
            this.onContextMenuListener);
        this.editor.addEventListener(SourceEditor.EVENTS.BREAKPOINT_CHANGE,
            this.onBreakpointChangeListener);

        if (this.initialized)
            this.editor.destroy();

        this.editor = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    showSource: function(source)
    {
        if (this.initialized)
            this.editor.setText(source);
        else
            this.defaultSource = source;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(event)
    {
        FBTrace.sysout("scriptView.onContextMenu", event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    onBreakpointChange: function(event)
    {
        if (this.skipEditorBreakpointChange)
            return;

        event.added.forEach(function(bp) {
            this.dispatch("onBreakpointAdd", [bp]);
        }, this);

        event.removed.forEach(function(bp) {
            this.dispatch("onBreakpointRemove", [bp]);
        }, this);
    },
});

// ********************************************************************************************* //
// Export

return ScriptView;

// ********************************************************************************************* //
});