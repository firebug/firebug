// https://developer.mozilla.org/en/Using_JavaScript_code_modules
var EXPORTED_SYMBOLS = ["FBTestIntegrate"];

var FBTestIntegrate =
{
    onSourceLinkClicked: function(elementClicked, url, lineNumber)
    {
        var winType = "FBTestConsole-SourceView";
        elementClicked.ownerDocument.defaultView.openDialog("chrome://global/content/viewSource.xul",
            winType, "all,dialog=no",
            url, null, null, lineNumber, false);
    }
};
