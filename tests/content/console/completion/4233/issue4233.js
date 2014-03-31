function runTest()
{
    FBTest.openNewTab(basePath + "console/completion/4233/issue4233.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FW.Firebug.chrome.selectPanel("console");
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                var completionBox = doc.getElementById("fbCommandLineCompletion");

                // xxxHonza: This should be polished and moved into FBTest namespace.
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
                    ["if(1)/i", false],
                    ["if(0);else/i", false],
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
                    ["a=0; try {i", true],
                    ["if(0) ; else { i", true],
                    ["throw {i", false],
                    ["throw f(i", true],
                    ["({a: i", true],
                    ["({ i", false],
                    ["({a: window, i", false],
                    ["{i", true],
                    ["{a: window, i", true],
                    ["function(i", false],
                    ["function  (i", false],
                    ["function f(i", false],
                    ["f=function(i", false],
                    ["function i", false],
                    ["function([i", false],
                    ["[{set a([i", false],
                    ["id.get+(i", true],

                    ["date().g", true],
                    ["make1().c", true],
                    ["make1().chain().c", true],
                    ["make2().c", true],
                    ["make2().chain().c", true],
                    ["getterSeemingEval('window').i", true],
                    ["getterSeemingEval('[window]')[0].i", true],
                    ["id(eval('window')).i", false],
                    ["String.prototype.ch", true],
                    ["new Date().g", true],

                    ["anArray.0", false],
                    ["anArray[\"0", true],
                    ["htmlCollection.0", false],
                    ["objWithNumericProps.0", true],

                    ["largeArray.leng", true],
                    ["largeArray.j", true],

                    ["// + d", false],
                    [" /* / + d", false],
                    ["/**/d", true],

                    // currently not handled
                    ["(window).i", false],
                    ["q='';q.s", false]
                ];

                var tasks = new FBTest.TaskList();
                for (var i = 0; i < tests.length; ++i) {
                    var test = tests[i];
                    tasks.push(testExpression, test[0], test[1]);
                }

                tasks.run(function()
                {
                    cmdLine.value = "";
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
