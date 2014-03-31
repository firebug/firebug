function runTest()
{
    FBTest.openNewTab(basePath + "search/6334/issue6334.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");
            var doc = panel.panelNode.ownerDocument;

            // Set focus to Firebug, otherwise the selection and the shortcut will be sent to the browser document
            doc.documentElement.focus();
            var searchField = FW.Firebug.chrome.$("fbSearchBox");
            
            // Execute searchBox focus shortcut
            FBTest.sendShortcut("F", {accelKey: true});
            searchField.value = "test";
            
            // Execute shortcut focus to searchBox and test if "test" is selected
            FBTest.sendShortcut("F", {accelKey: true});
            var selectedText = getSelection(searchField);
            FBTest.compare(searchField.value, selectedText, "Selection must be equal to searchBox value.");

            // Set focus on panel and redo focus check operation
            doc.documentElement.focus();
            FBTest.sendShortcut("F", {accelKey: true});
            var selectedText2 = getSelection(searchField);
            FBTest.compare(searchField.value, selectedText2, "Selection must be equal to searchBox value.");

            FBTest.testDone();
        });
    });
}

function getSelection(searchBox)
{
    // Get the children of the search box
    var searchBoxChildren = FW.FBL.domUtils.getChildrenForNode(searchBox, true);

    // Get the children of the text box inside the search box
    var textBoxChildren = FW.FBL.domUtils.getChildrenForNode(searchBoxChildren[0], true);

    // Get the input field within the text box
    var input = textBoxChildren[1].getElementsByClassName("textbox-input")[0];
    return input.value.substring(input.selectionStart, input.selectionEnd);
}
