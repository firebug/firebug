function runTest()
{
    FBTest.openNewTab(basePath + "console/completion/index/index.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");

                var tests = [
                    ["qqq", true, "window[\"qqq--\"]"],
                    ["qqa", true, "window[\"qqa'\\\"\\\\\"]"],
                    ["window.qqq", true, "window[\"qqq--\"]"],
                    ["window['", true],
                    ["window['qqq", true],
                    ["window[\"qqq", true],
                    ["window[\"qqa'", true, "window[\"qqa'\\\"\\\\\"]"],
                    ["window['qqa\\'", true, "window['qqa\\'\"\\\\']"],
                    ["-", false],
                    ["\"", false],
                    ["\\\"", false],
                    ["[\"", false],
                    ["qqq-", false],
                    ["window.qqa'", false],
                    ["window[", false],
                    ["window['qqa'", false],
                    ["window[/qq", false]
                ];

                var tasks = new FBTest.TaskList();
                for (var i = 0; i < tests.length; ++i) {
                    var test = tests[i];
                    tasks.push(testExpression, win, test[0], test[1], test[2]);
                }

                tasks.run(function()
                {
                    var doc = FW.Firebug.chrome.window.document;
                    var cmdLine = doc.getElementById("fbCommandLine");
                    cmdLine.value = "";

                    FBTest.testDone();
                });
            });
        });
    });
}

// ************************************************************************************************
// xxxHonza: This should be polished and moved into FBTest namespace.

function testExpression(callback, win, expr, shouldComplete, completeTo)
{
    var doc = FW.Firebug.chrome.window.document;
    var cmdLine = doc.getElementById("fbCommandLine");

    cmdLine.value = "";
    FBTest.typeCommand(expr);
    FBTest.synthesizeKey("VK_TAB", null, win);

    var changed = (cmdLine.value !== expr);
    FBTest.compare(shouldComplete, changed,
        "Completions should " + (shouldComplete ? "" : "not ") +
        "appear for: " + expr + " (cmd line: " + cmdLine.value + ")");

    if (completeTo)
    {
        FBTest.compare(completeTo, cmdLine.value,
            expr + " should be completed into " + completeTo);
    }

    setTimeout(callback);
}
