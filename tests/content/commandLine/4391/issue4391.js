function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4391/issue4391.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var contentView = FW.FBL.getContentView(win);
                FBTest.ok(!contentView._FirebugCommandLine,
                    "Commandline API should not be available now.");

                var tasks = new FBTest.TaskList();
                tasks.push(executeAndVerify, '$("#testElement")', /\<div\s*id\=\"testElement\"\>/,
                    "a", "objectLink objectLink-element");
                tasks.push(loadjQuery, win);
                tasks.push(executeAndVerify, '$("#testElement")', /div\#testElement/,
                    "a", "objectLink objectLink-element");

                tasks.run(function()
                {
                    var contentView = FW.FBL.getContentView(win);
                    FBTest.ok(!contentView._FirebugCommandLine,
                        "Commandline API should not be available now.");

                    FBTest.testDone();
                });
            });
        });
    });
}

function loadjQuery(callback, win)
{
    var loaded = win.document.getElementById("loaded");

    function jQueryLoaded()
    {
        loaded.removeEventListener("jQueryLoaded", jQueryLoaded, true);
        setTimeout(callback, 100);
    };

    loaded.addEventListener("jQueryLoaded", jQueryLoaded, true);
    FBTest.click(win.document.getElementById("loadjQuery"));
}

function executeAndVerify(callback, expression, expected, tagName, classes)
{
    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);

        FBTest.clearConsole();
        callback();
    });

    FBTest.progress("Execute expression: " + expression);
    FBTest.clearConsole();
    FBTest.executeCommand(expression);
}

