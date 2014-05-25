function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/7470/issue7470.html", (win) =>
    {
        FBTest.enableScriptPanel((win) =>
        {
            FBTest.setBreakpoint(null, "issue7470.html", 9, null, (row) =>
            {
                // Open the condition editor.
                var target = row.querySelector(".CodeMirror-linenumber");
                var event = {type: "mousedown", button: 2};
                FBTest.synthesizeMouse(target, 2, 2, event);
                var scriptPanel = FBTest.selectPanel("script");
                var conditionEditor = scriptPanel.panelNode.
                    querySelector(".conditionEditor");

                // Just a bit(zero-length) dealay to make sure the
                // condition editor is fully loaded.
                justDelay(() =>
                {
                    FBTest.ok(conditionEditor, "The condition editor must be opened.");

                    // Type 'false' in the editor and hit the enter key.
                    var editorInput = conditionEditor.querySelector(".completionInput");
                    editorInput.value = 'false';
                    FBTest.ok(editorInput, "Enter 'false' in the editor");

                    // Focus the editor to make sure it's selected before
                    // hitting the key enter.
                    FBTest.focus(editorInput);
                    FBTest.synthesizeKey("VK_RETURN", null, win);
                    FBTest.progress("Press the enter key to close the condition editor.");

                    var debuggerBreakIn = false;
                    FBTest.waitForBreakInDebugger(null, 9, true, () =>
                    {
                        debuggerBreakIn = true;
                        FBTest.clickContinueButton();
                    });
                    
                    // Another delay to make sure the breakpoint is set and
                    // the editor is closed.
                    justDelay(() =>
                    {
                        // Call the event handler.
                        FBTest.clickContentButton(win, "btnLogIt");
                    });

                    // Wait for a 300 milliseconds to make sure the debugger
                    // doesn't break on the conditional breakkpoint when it
                    // doesn't meet the condition.
                    var timeOut = setTimeout(() =>
                    {
                        FBTest.ok(!debuggerBreakIn, "The debugger must not break at the " +
                            "line #9 when it doesn't meet the condition");
                        FBTest.removeBreakpoint(null, "issue7470.html", 9, () =>
                        {
                            FBTest.testDone();
                        });
                    }, 300);
                });

                function justDelay(callback)
                {
                    setTimeout(callback);
                }

            });
        });
    });
}
