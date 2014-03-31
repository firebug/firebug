function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/5779/issue5779.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();

                tasks.push(FBTest.executeCommandAndVerify,
                    "$('div');",
                    "<div\u00A0class=\"test\">",
                    "a", "objectLink-element");

                tasks.push(FBTest.executeCommandAndVerify,
                    "$$('div');",
                    "[div.test, div#root, div.rootdiv1, div.rootdiv2]",
                    "span", "objectBox-array");

                tasks.push(FBTest.executeCommandAndVerify,
                    "$('div', document.getElementById('root'));",
                    "<div\u00A0class=\"rootdiv1\">",
                    "a", "objectLink-element");

                tasks.push(FBTest.executeCommandAndVerify,
                    "$$('div', document.getElementById('root'));",
                    "[div.rootdiv1, div.rootdiv2]",
                    "span", "objectBox-array");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}
