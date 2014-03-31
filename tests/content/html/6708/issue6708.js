function runTest()
{
    FBTest.openNewTab(basePath + "html/6708/issue6708.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Switch to the HTML panel
            var panel = FBTest.selectPanel("html");

            // 3. Inspect the blue <div>
            FBTest.selectElementInHtmlPanel("test", function(element)
            {
                FBTest.synthesizeMouse(panel.panelNode);

                // 4. Press Ctrl/⌘ + E
                FBTest.sendShortcut("e", {accelKey: true});

                var editor = panel.localEditors.html;

                if (FBTest.ok(editor, "Edit Mode must be enabled"))
                {
                    FBTest.compare(/<div class="a b c" id="test">\n\s+<p>Test<\/p>\n\s+<\/div>/,
                        editor.getValue(),
                        "Content of the editor must correspond to the selected element");

                    // Stop Edit Mode
                    FBTest.clickToolbarButton(null, "fbToggleHTMLEditing");

                    FBTest.testDone();
                }
            });
        });
    });
}
