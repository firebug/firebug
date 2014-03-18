function runTest()
{
    FBTest.openNewTab(basePath + "css/5469/issue5469.html", function(win)
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

                function test(callback, input, output)
                {
                    editor.value = input;
                    var zero = input.indexOf("0");
                    editor.setSelectionRange(zero, zero);
                    FBTest.synthesizeKey("VK_UP", null, win);
                    FBTest.compare(output, editor.value, "Incrementing zero of \"" + input + "\" " +
                        String.fromCharCode(8594) + " \"" + output + "\"");
                    callback();
                }

                var tasks = new FBTest.TaskList();
                tasks.push(test, "-1.1em 0", "-1.1em 1em");
                tasks.push(test, "0", "1px");
                tasks.push(test, "'a 0 b'", "'a 1 b'");
                tasks.push(test, "-moz-calc(11px * 0)", "-moz-calc(11px * 1)");

                tasks.run(function()
                {
                    FBTest.synthesizeKey("VK_ESCAPE", null, win);
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
