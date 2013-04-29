define([
    "firebug/firebug",
    "firebug/editor/codemirror/CodeMirror",
],
function (Firebug, CodeMirror)
{

    function SourceEditor()
    {
        this._view = null;
        this._editorObject = null;
    }

    SourceEditor.prototype =
    {
        init: function (parentNode, config, callBcak)
        {

            this._editorObject = CodeMirror(function (elt)
            {
                parentNode.appendChild(elt);
                this._view = elt;
            },
            {
                value: "A text to test CM initializing only! ",
                lineNumbers: true,
                gutters: ["CodeMirror-lineNumbers"]
            });
        }
    };

    // ********************************************************************************************* //
    return SourceEditor;
});