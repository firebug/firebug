/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/trace",
],
function (FBTrace) {

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

ScriptView.prototype = 
{
    dispatchName: "ScriptView",
    initialized: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(parentNode)
    {
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

    destroy: function()
    {
        if (this.initialized)
            this.editor.destroy();

        this.editor = null;
    },

    onEditorLoad: function()
    {
        this.initialized = true;

        this.editor.focus();

        if (this.defaultSource)
            this.showSource(this.defaultSource);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    showSource: function(source)
    {
        if (this.initialized)
            this.editor.setText(source);
        else
            this.defaultSource = source;
    }
};

// ********************************************************************************************* //
// Export

return ScriptView;

// ********************************************************************************************* //
});