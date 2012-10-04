function runTest()
{
    FBTest.sysout("issue5504.START");

    FBTest.openNewTab(basePath + "html/5504/issue5504.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("html");

        // Get the selected element and execute "New Attribute" action on it.
        var nodeBox = getSelectedNodeBox();
        FBTest.executeContextMenuCommand(nodeBox, "htmlNewAttribute", function()
        {
            // Wait till the inline editor is available.
            var config = {tagName: "input", classes: "textEditorInner"};
            FBTest.waitForDisplayedElement("html", config, function(editor)
            {
                FBTest.compare("", editor.value, "The default value must be an empty string");
                FBTest.testDone("issue5504.DONE");
            });
        });
    });
}

// xxxHonza: use the one from FBTest (should be in FBTest 1.10b5)
function getSelectedNodeBox()
{
    var panel = FBTest.getPanel("html");
    return panel.panelNode.querySelector(".nodeBox.selected");
}
