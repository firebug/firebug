function runTest()
{
    FBTest.openNewTab(basePath + "css/selectors/6058/issue6058.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectSidePanel("selectors");

            FBTest.ok(panel, "Selectors side panel must be there");

            // Create new selector trial
            var panelNode = panel.panelNode;
            var trySelectorField = panelNode.getElementsByClassName("selectorEditorContainer")[0];
            FBTest.ok(trySelectorField, "Field to create a new selector group must be there");

            // Click to open a text editor
            FBTest.click(trySelectorField);

            var editor = panelNode.getElementsByClassName("selectorsPanelEditor")[0];
            FBTest.ok(editor, "Selector editor must be there");

            function test(callback, input, output)
            {
                editor.value = "";
                editor.value = input.slice(0, -1);
                FBTest.synthesizeKey(input.slice(-1), null, win);
                FBTest.compare(output, editor.value, "Completing \"" + input + "\" → \"" + output + "\"");
                callback();
            }

            var tasks = new FBTest.TaskList();
            tasks.push(test, ".he", ".hello");
            tasks.push(test, "#wo", "#world");
            tasks.run(function()
            {
                FBTest.synthesizeKey("VK_ESCAPE", null, win);
                FBTest.testDone();
            }, 0);
        });
    });
}
