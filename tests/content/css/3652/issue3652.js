function runTest()
{
    FBTest.openNewTab(basePath + "css/3652/issue3652.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.querySelectorAll(".cssPropValue");
                FBTest.compare(0, !values.length, "There must be at least one CSS value.");

                // Click the CSS value to open the inline editor.
                FBTest.synthesizeMouse(values[1]);

                // Type 'r' and verify auto completion.
                var editor = panel.panelNode.querySelector(".textEditorInner");
                FBTest.sendChar("Y", editor);
                FBTest.compare("YELLOW", editor.value, "Must be autocompleted to 'YELLOW'.");

                // Testing up and down arrows covers issue 3671
                // Type 'arrow-up' and verify completion (should be the previous
                // color starting with 'r').
                FBTest.sendKey("UP", editor);
                FBTest.compare("YELLOWGREEN", editor.value, "Must be autocompleted to 'YELLOWGREEN'.");

                // Type 'arrow-down' and verify completion.
                FBTest.sendKey("DOWN", editor);
                FBTest.compare("YELLOW", editor.value, "Must be autocompleted again to 'YELLOW'.");

                // Type 'home' to move the cursor at the beginning and cancel the selection.
                // Consequently type 'arrow-up' to get the (global) previous color.
                // DOM_VK_HOME doesn't work on MAC, press left 6x instead.
                for (var i = 0; i < 6; i++)
                    FBTest.sendKey("LEFT", editor);

                FBTest.sendKey("UP", editor);
                FBTest.compare("whitesmoke", editor.value, "Must be autocompleted to 'whitesmoke'.");

                // And again go back to 'red'
                FBTest.sendKey("DOWN", editor);
                FBTest.compare("yellow", editor.value, "Must be autocompleted to 'yellow'.");

                FBTest.testDone();
            });
        });
    });
}
