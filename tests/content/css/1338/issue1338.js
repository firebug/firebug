function runTest()
{
    FBTest.openNewTab(basePath + "css/1338/issue1338.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.querySelectorAll(".cssPropValue");

                // Click the CSS value of the height property to open the inline editor
                FBTest.synthesizeMouse(values[2]);

                var editor = panel.panelNode.querySelector(".textEditorInner");

                // Press 'Up' and verify incrementation
                FBTest.sendShortcut("VK_UP");
                FBTest.compare("8em", editor.value, "Must be incremented to 8em");

                // Press 'Ctrl+Up' and verify incrementation
                FBTest.sendShortcut("VK_UP", {ctrlKey: true});
                FBTest.compare("8.1em", editor.value, "Must be incremented to 8.1em");

                // Press 'Shift+Up' and verify incrementation
                FBTest.sendShortcut("VK_UP", {shiftKey: true});
                FBTest.compare("18.1em", editor.value, "Must be incremented to 18.1em");

                // Press 'Down' and verify incrementation
                FBTest.sendShortcut("VK_DOWN");
                FBTest.compare("17.1em", editor.value, "Must be decremented to 17.1em");

                // Press 'Ctrl+Down' and verify incrementation
                FBTest.sendShortcut("VK_DOWN", {ctrlKey: true});
                FBTest.compare("17.0em", editor.value, "Must be decremented to 17.0em");

                // Press 'Shift+Down' and verify incrementation
                FBTest.sendShortcut("VK_DOWN", {shiftKey: true});
                FBTest.compare("7em", editor.value, "Must be decremented to 7em");

                // Press 'PageDown' and verify incrementation
                FBTest.sendShortcut("VK_PAGE_DOWN");
                FBTest.compare("-3em", editor.value, "Must be decremented to -3em");

                // Press 'PageUp' and verify incrementation
                FBTest.sendShortcut("VK_PAGE_UP");
                FBTest.compare("7em", editor.value, "Must be incremented to 7em");

                // Press 'Shift+PageDown' and verify incrementation
                FBTest.sendShortcut("VK_PAGE_DOWN", {shiftKey: true});
                FBTest.compare("-93em", editor.value, "Must be decremented to -93em");

                // Press 'Shift+PageUp' and verify incrementation
                FBTest.sendShortcut("VK_PAGE_UP", {shiftKey: true});
                FBTest.compare("7em", editor.value, "Must be incremented to 7em");

                FBTest.testDone();
            });
        });
    });
}
