function runTest()
{
    FBTest.sysout("issue5504.START");

    FBTest.openNewTab(basePath + "html/5504/issue5504.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("html");

        // Get the selected elemetn and execute "New Attribute" action on it.
        var nodeBox = getSelectedNodeBox();
        FBTest.executeContextMenuCommand(nodeBox, "htmlNewAttribute", function()
        {
            var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
            FBTest.compare("", editor.value, "The default value must be an empty string");
            FBTest.testDone("issue5504.DONE");
        });
    });
}

// xxxHonza: use the one from FBTest
function getSelectedNodeBox()
{
    var panel = FBTest.getPanel("html");
    return panel.panelNode.querySelector(".nodeBox.selected");
}
