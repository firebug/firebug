/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/http",
    "firebug/lib/dom",
],
function (Firebug, Http, Dom) {

// ********************************************************************************************* //
// Constants

var codeMirrorSrc = "chrome://firebug/content/editor/codemirror/codemirror.js";
var jsModeSrc = "chrome://firebug/content/editor/codemirror/mode/javascript.js";

var Trace = FBTrace.to("DBG_SCRIPTEDITOR");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Source Editor Implementation

function SourceEditor()
{
    this.view = null;
    this.editorObject = null;
}

SourceEditor.prototype =
{
    init: function (parentNode, config, callback)
    {
        var doc = parentNode.ownerDocument;

        // Append CM scripts into the panel.html
        Dom.addScript(doc, "cm", Http.getResource(codeMirrorSrc));
        Dom.addScript(doc, "cm-js", Http.getResource(jsModeSrc));

        function onEditorCreate(elt)
        {
            parentNode.appendChild(elt);

            this.view = elt;

            callback();
        }

        // Create editor;
        this.editorObject = doc.defaultView.CodeMirror(
            onEditorCreate.bind(this), config);

        Trace.sysout("sourceEditor.init; ", this.view);
    },

    destroy: function()
    {
        // TODO
    },

    setText: function(text)
    {
        this.editorObject.setValue(text);
    },

    getText: function()
    {
        return this.editorObject.getValue();
    },

    getCharCount: function()
    {
        // TODO
    },

    setDebugLocation: function()
    {
        // TODO
    },

    getTopIndex: function()
    {
        // TODO
        return 0
    }
};

// ********************************************************************************************* //
// Registration

return SourceEditor;

// ********************************************************************************************* //
});