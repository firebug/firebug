function runTest()
{
    FBTest.openNewTab(basePath + "html/5504/issue5504.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");

            // Get the selected element and execute "New Attribute" action on it.
            var nodeBox = FBTest.getSelectedNodeBox();
            FBTest.executeContextMenuCommand(nodeBox, "htmlNewAttribute", function()
            {
                // Wait till the inline editor is available.
                var config = {tagName: "input", classes: "textEditorInner"};
                FBTest.waitForDisplayedElement("html", config, function(editor)
                {
                    FBTest.compare("", editor.value, "The default value must be an empty string");
                    FBTest.testDone();
                });
            });
        });
    });
}
