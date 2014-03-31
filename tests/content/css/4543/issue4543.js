function runTest()
{
    FBTest.openNewTab(basePath + "css/4543/issue4543.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var value = panel.panelNode.querySelector(".cssPropValue");

                // Click the CSS value to open the inline editor
                // Click at the left-top corner of the first client rect (see issue 6049).
                var rects = node.getClientRects();
                FBTest.synthesizeMouse(value, rects[0].left, rects[0].top);

                var editor = panel.panelNode.querySelector(".textEditorInner");
                if (FBTest.ok(editor, "editor must be available now"))
                {
                    // DOM_VK_HOME key doesn't work on Mac and we need to use DOM_VK_LEFT
                    // to move the cursor at the beginning of the inline editor.
                    var key = FBTest.isMac() ? "LEFT" : "HOME";
                    FBTest.sendKey(key, editor);

                    // Move text cursor between 'g' and 'b' of 'pngbase64'
                    for (var i=0; i<19; i++)
                        FBTest.sendKey("RIGHT", editor);

                    // Enter a semicolon
                    FBTest.sendChar(";", editor);
                    FBTest.compare(/png;base64/, editor.value, "Semicolon must be entered");
                }

                FBTest.testDone();
            });

            // xxxsz: Needs to be executed after the first test
            /*
            var imgURL = basePath + "css/4543/issue4543.png";
            FBTest.loadImageData(imgURL, function(expectedImage)
            {
                var actualImage = FBTest.getImageDataFromNode(win.document.getElementById("element1"));
                FBTest.compare(expectedImage, actualImage, "The screen must be in expected state");
            });
            */
        });
    });
}
