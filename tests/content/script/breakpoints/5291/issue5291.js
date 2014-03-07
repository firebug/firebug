function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/5291/issue5291.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.setBreakpoint(null, "issue5291.html", 24, null, function(row)
            {
                var target = row.querySelector(".CodeMirror-linenumber");

                // Right click on the target element.
                var eventDetails = {type: "mousedown", button: 2};
                FBTest.synthesizeMouse(target, 2, 2, eventDetails);

                var panel = FBTest.getSelectedPanel();
                var conditionEditor = panel.panelNode.querySelector(".conditionEditor");
                FBTest.ok(conditionEditor, "Editor must exist");

                var editor = conditionEditor.querySelector(".completionInput");
                var completionBox = conditionEditor.querySelector(".completionBox");

                function testCompletion(from, to)
                {
                    var f = from.length;
                    editor.value = from.substr(0, f-1);
                    FBTest.synthesizeKey(from.substr(f-1, 1), null, win);
                    FBTest.compare(to.substr(f), completionBox.value.substr(f),
                        "auto-completing '" + from + "' -> '" + to + "'");
                }

                function waitUntilShown(callback)
                {
                    // The condition editor will receive focus and be shown after a 0-length
                    // timeout. Do the same; Firefox guarantees that the timers will run in order.
                    setTimeout(callback);
                }

                waitUntilShown(function()
                {
                    // Completions from local scope.
                    testCompletion("anArg", "anArgument");
                    testCompletion("unrel", "unrelated");
                    testCompletion("dumm", "");
                    testCompletion("innerF", "innerFunction");
                    testCompletion("outerF", "outerFunction");
                    testCompletion("hois", "hoistedVar");

                    // CodeMirror only provides access to variables behind the parse point, so these
                    // aren't found even though they are in scope.
                    testCompletion("notFound", "");

                    // Standard completions.
                    testCompletion("wind", "window");
                    testCompletion("window.doc", "window.document");

                    FBTest.testDone();
                });
            });
        });
    });
}
