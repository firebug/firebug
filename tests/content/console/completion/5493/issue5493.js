function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "console/completion/5493/issue5493.html", function(win)
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

                function testExpression(callback, expr, wanted)
                {
                    cmdLine.value = "";
                    FBTest.typeCommand(expr);
                    var desc = expr;
                    if (expr.slice(-1) === "x")
                    {
                        FBTest.synthesizeKey("VK_BACK_SPACE", null, win);
                        desc += "<backspace>";
                    }
                    FBTest.synthesizeKey("VK_TAB", null, win);
                    FBTest.compare(wanted, cmdLine.value, "Completing \"" + desc + "\" → \"" + wanted + "\"");
                    callback();
                }

                function testVisibleCase(callback)
                {
                    cmdLine.value = "";
                    FBTest.typeCommand(";obj.ab");
                    FBTest.compare("cdE", completionBox.value.substr(";obj.ab".length),
                        "Completion box should retain the exact prefix");
                    waitForOpen(function()
                    {
                        var el = popup.querySelector("div[selected=true]");
                        FBTest.ok(el, "The completion popup should open, with something selected");
                        FBTest.compare("obj.aBcdE", el.textContent,
                            "Completion popup should show the case of the completion");
                        callback();
                    });
                }

                var tests = [
                    ["A", "AbcD"],
                    ["a", "aBcdE"],
                    ["AB", "AB"],
                    ["ab", "aBcdE"],
                    ["abx", "AbcD"],
                    ["Abcd", "AbcD"]
                ];

                var tasks = new FBTest.TaskList();
                for (var i = 0; i < tests.length; ++i) {
                    var test = tests[i];
                    tasks.push(testExpression, "obj."+test[0], "obj."+test[1]);
                }
                tasks.push(testExpression, "document.gete", "document.getElementById");
                tasks.push(testExpression, "decodeu", "decodeURI");
                tasks.push(testExpression, "obje", "obje");
                tasks.push(testExpression, "Obje", "Object");
                tasks.push(testVisibleCase);

                tasks.run(function()
                {
                    cmdLine.value = "";
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
