function runTest()
{
    FBTest.openNewTab(basePath + "css/3671/issue3671.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("testElement", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var names = panel.panelNode.querySelectorAll(".cssPropName");
                FBTest.compare(1, names.length, "There must be just one CSS property.");

                // Click the CSS name to open the inline editor.
                FBTest.synthesizeMouse(names[0]);

                var editor = panel.panelNode.querySelector(".textEditorInner");

                // Type 'arrow-up' and verify completion.
                FBTest.sendKey("UP", editor);
                FBTest.compare("margin-left", editor.value,
                    "Must autocomplete to 'margin-left'");

                // Type 'arrow-down' and verify completion.
                FBTest.sendKey("DOWN", editor);
                FBTest.compare("margin-right", editor.value,
                    "Must autocomplete to 'margin-right'");

                FBTest.testDone();
            });
        });
    });
}
