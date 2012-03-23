function runTest()
{
    FBTest.sysout("issue3303.START");

    FBTest.openNewTab(basePath + "css/3303/issue3303.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        FBTest.selectElementInHtmlPanel("font", function(node)
        {
            var panel = FBTest.selectSidePanel("css");
            var values = panel.panelNode.querySelectorAll(".cssPropValue");

            // Click the CSS value of the height property to open the inline editor
            FBTest.synthesizeMouse(values[0]);

            var editor = panel.panelNode.querySelector(".textEditorInner");

            // Press 'Down' and verify auto-completion
            FBTest.sendShortcut("VK_DOWN");
            FBTest.compare(/Comic Sans MS,\s*serif/, editor.value, "Property value must be 'Comic Sans MS,serif'");
            FBTest.compare("Comic Sans MS", editor.value.substring(editor.selectionStart, editor.selectionEnd), "'Comic Sans MS' must be selected");

            // Press 'Down' and verify auto-completion
            FBTest.sendShortcut("VK_DOWN");
            FBTest.compare(/Georgia,\s*serif/, editor.value, "Property value must be 'Georgia,serif'");
            FBTest.compare("Georgia", editor.value.substring(editor.selectionStart, editor.selectionEnd), "'Georgia' must be selected");

            // Press 'Up' and verify auto-completion
            FBTest.sendShortcut("VK_UP");
            FBTest.compare(/Comic Sans MS,\s*serif/, editor.value, "Property value must be 'Comic Sans MS,serif'");
            FBTest.compare("Comic Sans MS", editor.value.substring(editor.selectionStart, editor.selectionEnd), "'Comic Sans MS' must be selected");

            // Press 'Up' and verify auto-completion
            FBTest.sendShortcut("VK_UP");
            FBTest.compare(/Arial,\s*serif/, editor.value, "Property value must be 'Arial,serif'");
            FBTest.compare("Arial", editor.value.substring(editor.selectionStart, editor.selectionEnd), "'Arial' must be selected");

            FBTest.testDone("issue3303.DONE");
        });
    });
}
