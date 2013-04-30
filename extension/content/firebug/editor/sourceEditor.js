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
var jsMode = "chrome://firebug/content/editor/codemirror/mode/javascript.js";

// xxxHonza: just temporary default text
var defaultText = Http.getResource("chrome://firebug/content/net/netPanel.js");

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
        Dom.addScript(doc, "cm-js", Http.getResource(jsMode));

        var self = this;
        this.editorObject = doc.defaultView.CodeMirror(function(elt)
        {
            parentNode.appendChild(elt);
            self.view = elt;
        },
        {
            readOnly: true,
            mode: "javascript",
            value: defaultText,
            lineNumbers: true,
            // xxxHonza: why this is here?
            //gutters: ["CodeMirror-lineNumbers"],
            theme: "firebug"
        });
    },

    setText: function(text)
    {
        // TODO
    }
};

// ********************************************************************************************* //
// Registration

return SourceEditor;

// ********************************************************************************************* //
});