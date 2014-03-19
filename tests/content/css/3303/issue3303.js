function runTest()
{
    FBTest.openNewTab(basePath + "css/3303/issue3303.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("font", function(node)
            {
                const MAX_TIMES = 30;
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.querySelectorAll(".cssPropValue");

                // Click the CSS value of the height property to open the inline editor
                FBTest.synthesizeMouse(values[0]);

                var editor = panel.panelNode.querySelector(".textEditorInner");

                // Press 'Down' until a font with spaces is reached
                i = 0;
                do {
                    FBTest.sendShortcut("VK_DOWN");
                } while(editor.value.search(" ") == -1 && ++i < MAX_TIMES);

                if (FBTest.compare(/ /, editor.value, "Property value must contain a font with spaces now"))
                {
                    var firstFont = editor.value.match(/.*?(?=,)/)[0];
                    FBTest.compare(firstFont, editor.value.substring(editor.selectionStart, editor.selectionEnd), "The selection must extend up to the comma");
                }

                // Press 'Down' until a font without spaces is reached
                i = 0;
                do {
                    FBTest.sendShortcut("VK_DOWN");
                } while(editor.value.search(" ") != -1 && ++i < MAX_TIMES);

                if (FBTest.compare(/^\S+$/, editor.value, "Property value must contain a font without spaces now"))
                {
                    var firstFont = editor.value.match(/.*?(?=,)/)[0];
                    FBTest.compare(firstFont, editor.value.substring(editor.selectionStart, editor.selectionEnd), "The selection must extend up to the comma");
                }

                // Press 'Up' until a font with spaces is reached
                i = 0;
                do {
                    FBTest.sendShortcut("VK_UP");
                } while(editor.value.search(" ") == -1 && ++i < MAX_TIMES);

                if (FBTest.compare(/ /, editor.value, "Property value must contain a font with spaces now"))
                {
                    var firstFont = editor.value.match(/.*?(?=,)/)[0];
                    FBTest.compare(firstFont, editor.value.substring(editor.selectionStart, editor.selectionEnd), "The selection must extend up to the comma");
                }

                // Press 'Up' until 'Arial' is reached again
                i = 0;
                do {
                    FBTest.sendShortcut("VK_UP");
                } while(editor.value.search("Arial") == -1 && ++i < MAX_TIMES);

                if (FBTest.compare(/Arial/, editor.value, "Property value must contain 'Arial' now"))
                {
                    FBTest.compare("Arial", editor.value.substring(editor.selectionStart, editor.selectionEnd), "The selection must extend up to the comma");
                }

                FBTest.testDone();
            });
        });
    });
}
