function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/api.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.clearCache();
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();

                // Every task defined below, executes an expression on the command
                // line and verifies the displayed output in the console.
                // See executeAndVerify method below for description of individual
                // parameters.

                // \u00A0 == &nbsp; == #160 -> used by nodeTag domplate.
                tasks.push(executeAndVerify, "$(\"#test1\")", "<div\u00A0id=\"test1\">",
                    "a", "objectLink objectLink-element");

                tasks.push(executeAndVerify, "$$(\".a.c\")", "[div.a.b.c.d, div.a.c]",
                    "span", "objectBox objectBox-array");

                tasks.push(executeAndVerify, "$x(\"html/body/span/div[1]\")", "[div.test]",
                    "span", "objectBox objectBox-array");

                tasks.push(executeAndVerify, "dir(a)", /\s*a\s*10\s*/,
                    "table", "domTable");

                tasks.push(executeAndVerify, "dirxml($('#test3'))",
                    "<div\u00A0id=\"test3\"><div></div></div>",
                    "div", "logRow logRow-dirxml");

                tasks.push(executeAndVerify, "keys(b)", "[\"a\", \"name\"]",
                    "span", "objectBox objectBox-array");

                tasks.push(executeAndVerify, "values(b)", "[7, \"a\"]",
                    "span", "objectBox objectBox-array");

                tasks.push(executeAndVerify, "table(a)",
                    FW.FBL.$STR("firebug.reps.table.ObjectProperties") +
                    FW.FBL.$STR("firebug.reps.table.ObjectValues") + "\"a\"10",
                    "div", "logRow logRow-table");

                // $$ must return a real array so, eg map() can be applied.
                tasks.push(executeAndVerify,
                    "$$('.a').map(function(item){return item.localName;});",
                    "[\"div\", \"div\", \"div\"]",
                    "span", "objectBox objectBox-array");

                // $x must also return a real array so, eg map() can be applied.
                tasks.push(executeAndVerify,
                    "$x(\"//div[contains(@class, 'a')]\").map",
                    "map()",
                    "a", "objectLink objectLink-function");

                // Again test the returned array.
                tasks.push(executeAndVerify, "keys(b).map", "map()",
                    "a", "objectLink objectLink-function");

                // Again test the returned array.
                tasks.push(executeAndVerify, "values(b).map", "map()",
                    "a", "objectLink objectLink-function");

                // Run all expressions step by step.
                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

/**
 * Helper function for executing expression on the command line.
 * @param {Function} callback Appended by the test harness.
 * @param {String} expression Expression to be executed.
 * @param {String} expected Expected value displayed.
 * @param {String} tagName Name of the displayed element.
 * @param {String} class Class of the displayed element.
 */
function executeAndVerify(callback, expression, expected, tagName, classes)
{
    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);

        FBTest.clickToolbarButton(null, "fbConsoleClear");
        callback();
    });

    FBTest.executeCommand(expression);
}
