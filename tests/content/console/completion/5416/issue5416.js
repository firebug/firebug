function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "console/completion/5416/issue5416.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                var completionBox = doc.getElementById("fbCommandLineCompletion");
                var popup = doc.getElementById("fbCommandLineCompletionList");

                function waitForOpen(callback)
                {
                    if (popup.state === "open")
                        callback();
                    else
                        setTimeout(waitForOpen, 10, callback);
                }

                function testExpression(callback, expr, shouldComplete)
                {
                    // To save on time, only send the last character as a key press.
                    cmdLine.focus();
                    cmdLine.value = expr.slice(0, -1);
                    FBTest.synthesizeKey(expr.slice(-1), null, win);
                    FBTest.synthesizeKey("VK_TAB", null, win);

                    var hasCompletion = (completionBox.value.length <= expr.length);
                    FBTest.compare(shouldComplete, hasCompletion,
                        "Completions should " + (shouldComplete ? "" : "not ") +
                        "appear for: " + expr);

                    callback();
                }

                function testAppearance(callback, expr, expectedApi, expectedNormal)
                {
                    cmdLine.value = "";
                    FBTest.typeCommand(expr);
                    waitForOpen(function()
                    {
                        var el = popup.querySelector("div[selected=true]");
                        FBTest.ok(el, "The completion popup should open, with something selected");

                        var total = popup.getElementsByClassName("completionLine").length;
                        var api = popup.getElementsByClassName("apiCompletion").length;
                        FBTest.compare(expectedApi, api,
                            "Completion popup should show the right number of API completions");
                        FBTest.compare(expectedNormal, total - api,
                            "Completion popup should show the right number of regular completions");
                        callback();
                    });
                }

                var existenceTests = [
                    ["dirx", true],
                    ["if (false)dirx", true],
                    ["dirxml.", true],
                    ["copy", true],
                    ["window.copy", true],
                    ["window.dirx", false],
                    ["traceA", false]
                ];

                var tasks = new FBTest.TaskList();
                for (var i = 0; i < existenceTests.length; ++i) {
                    var test = existenceTests[i];
                    tasks.push(testExpression, test[0], test[1]);
                }
                tasks.push(testAppearance, "cop", 0, 2);
                tasks.push(testAppearance, "und", 1, 1);

                tasks.run(function()
                {
                    cmdLine.value = "";
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
