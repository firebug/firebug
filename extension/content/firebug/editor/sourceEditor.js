/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/http",
    "firebug/editor/codemirror/codemirror",
],
function (Firebug, Http, CodeMirror) {

// ********************************************************************************************* //
// Constants

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
    init: function (parentNode, config, callBcak)
    {
        this.editorObject = CodeMirror(function(elt)
        {
            parentNode.appendChild(elt);
            this.view = elt;
        },
        {
            mode: "javascript",
            value: defaultText,
            lineNumbers: true,
            gutters: ["CodeMirror-lineNumbers"]
        });
    }
};

// ********************************************************************************************* //
// Registration

return SourceEditor;

// ********************************************************************************************* //
});