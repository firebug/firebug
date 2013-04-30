define([
    "firebug/firebug",
    "firebug/editor/codemirror/CodeMirror",
],
function (Firebug, CodeMirror) {

    // ********************************************************************************************* //
    // Constants
    const Cc = Components.classes;
    const Ci = Components.interfaces;

    const styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

    // Default css file for CM is codemirror.css.
    const cssURI = ioService.newURI("chrome://firebug/skin/codemirror.css", null, null);
    styleSheetService.loadAndRegisterSheet(cssURI, styleSheetService.USER_SHEET);

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