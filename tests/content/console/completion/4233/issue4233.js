function runTest()
{
    FBTest.sysout("issue4233.START");
    FBTest.openNewTab(basePath + "console/completion/4233/issue4233.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("console");

            var tests = [
                ["i", true],
                ["document.q", true],
                ["window.window.window.i", true],
                ["document.querySelector('div').a", true],
                ["document.querySelectorAll('div')[0].a", true],
                ["document.querySelector('div').querySelector.c", true],
                ["document.querySelector('div').parentNode.querySelector('div').a", true],
                ["alert.c", true],
                ["Ma", true],
                ["window.Math.s", true],
                ["for (var i = 0; i < 2; ++i) document.querySelectorAll('div')[i].a", true],
                ["[].s", true],
                ["''.s", true],
                ["'\"'+i", true],

                ["id[/\\[/]=i", true],
                ["throw(1)/i", true],
                ["id(1)/i", true],
                ["(1)/i", true],
                ["/a/.t", true],
                ["(1)/i", true],
                ["if(1)/i", false],
                ["if(1)/i", false],
                ["(function()/i", false],
                ["/[/; i", false],
                ["1+/i", false],
                ["id[/[/]=i", false],
                ["id[/[/]/i", false],

                ["var a = i", true],
                ["var i", false],
                ["var a = 0, i", false],
                ["var a, i", false],
                ["if(1){i", true],
                ["a=0;{i", true],
                ["({a: i", true],
                ["({ i", false],
                ["({a: window, i", false],
                ["{i", true],
                ["{a: window, i", true],
                ["function(i", false],
                ["function f(i", false],
                ["f=function(i", false],
                ["function i", false],
                ["function([i", false],

                ["date().g", true],
                ["mk4().c", true],
                ["mk4().chain().c", true],
                ["getterSeemingEval('window').i", true],
                ["getterSeemingEval('[window]')[0].i", true],
                ["id(eval('window')).i", false],
                ["String.prototype.ch", true],
                ["new Date().g", true],

                // currently not handled
                ["(window).i", false],
                ["q='';q.s", false]
            ];

            var tasks = new FBTest.TaskList();
            for (var i = 0; i < tests.length; ++i) {
                var test = tests[i];
                tasks.push(testExpression, win, test[0], test[1]);
            }

            tasks.run(function()
            {
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                cmdLine.value = "";

                FBTest.testDone("issue4233.DONE");
            });
        });
    });
}

// ************************************************************************************************
// xxxHonza: This should be polished and moved into FBTest namespace.

function testExpression(callback, win, expr, shouldComplete)
{
    var doc = FW.Firebug.chrome.window.document;
    var cmdLine = doc.getElementById("fbCommandLine");

    cmdLine.value = "";
    FBTest.typeCommand(expr);
    FBTest.synthesizeKey("VK_TAB", null, win);

    var changed = (cmdLine.value !== expr);
    FBTest.compare(shouldComplete, changed,
        "Completions should " + (shouldComplete ? "" : "not ") +
        "appear for: " + expr);

    setTimeout(callback);
}
