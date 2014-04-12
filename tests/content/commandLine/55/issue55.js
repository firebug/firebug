function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/55/issue55.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                // Click the Command Line toggle button to switch to the Command Editor
                FBTest.clickToolbarButton(null, "fbToggleCommandLine");

                var commandEditor = FW.Firebug.CommandLine.getCommandEditor();

                function testCompletion(callback, before, after, useSecond)
                {
                    var beforeCursor = before.indexOf("|");
                    var beforeString = before.replace("|", "");
                    FBTest.clearAndTypeCommand("", true);
                    commandEditor.value = beforeString;
                    commandEditor.setSelectionRange(beforeCursor, beforeCursor);

                    FBTest.sysout("Auto-completing: " + before);
                    FBTest.synthesizeKey("VK_TAB", null, win);

                    if (useSecond)
                    {
                        FBTest.compare(beforeString, commandEditor.value,
                            "Should have several results, so no completion yet.");
                        FBTest.synthesizeKey("VK_DOWN", null, win);
                        FBTest.synthesizeKey("VK_TAB", null, win);
                    }

                    FBTest.compare(after.replace("|", ""), commandEditor.value, "Text should match.");
                    FBTest.ok(commandEditor.isCollapsed(), "Selection should be collapsed.");
                    FBTest.compare(after.indexOf("|"), commandEditor.getSelection().start, "Cursor position should match.");

                    FBTest.clearCommand(true);

                    callback();
                }

                function testSelectionIndent(callback)
                {
                    FBTest.clearAndTypeCommand("", true);
                    commandEditor.value = "document.get";
                    var len = commandEditor.value.length;
                    commandEditor.setSelectionRange(len - 1, len);

                    FBTest.synthesizeKey("VK_TAB", null, win);

                    var indent = "    ";
                    FBTest.compare(indent + "document.get", commandEditor.value, "Text should be indented.");
                    FBTest.compare(len - 1 + indent.length, commandEditor.getSelection().start, "Selection start should remain.");
                    FBTest.compare(len + indent.length, commandEditor.getSelection().end, "Selection end should remain.");

                    FBTest.clearCommand(true);

                    callback();
                }

                var tasks = new FBTest.TaskList();
                var input1 = "function fun(anArgument1) { function fun2(anArgument2) {\n} anArg";
                tasks.push(testCompletion, input1, input1 + "ument1|");
                tasks.push(testCompletion, "myobj.prop|;", "myobj.prop2|;", true);
                tasks.push(testCompletion, "document.get|elementbyi;", "document.getElementById|;");
                tasks.push(testCompletion, "|document.gete", "    |document.gete");
                tasks.push(testSelectionIndent);

                tasks.run(function()
                {
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
