function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/dom.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var taskList = new FBTest.TaskList();

                // Every task defined below, executes an expression on the command
                // line and verifies the displayed output in the console.
                // See executeAndVerify method below for description of individual
                // parameters.

                taskList.push(executeAndVerify, "state = true;", "true",
                    "span", "objectBox objectBox-number");

                taskList.push(executeAndVerify, "window", "Window dom.html",
                    "a", " objectLink objectLink-object");

                taskList.push(executeAndVerify, "document", "Document dom.html",
                    "a", " objectLink objectLink-object");

                taskList.push(executeAndVerify, "aa", "\"three\"",
                    "span", "objectBox objectBox-string");

                taskList.push(executeAndVerify, "cc", "null",
                    "span", "objectBox objectBox-null");

                taskList.push(executeAndVerify, "dd", "2",
                    "span", "objectBox objectBox-number");

                taskList.push(executeAndVerify, "dd = 999", "999",
                    "span", "objectBox objectBox-number");

                taskList.push(executeAndVerify, "dd", "999",
                    "span", "objectBox objectBox-number");

                taskList.push(executeAndVerify, "set_d_val", "set_d_val(td)",
                    "a", "objectLink objectLink-function");

                taskList.push(executeAndVerify, "set_d_val(998);", "998",
                    "span", "objectBox objectBox-number");

                // Strings with copyable white-space
                taskList.push(executeAndVerify, "multiline", "\"multi\nline\"",
                    "pre", "objectBox objectBox-string");
                taskList.push(executeAndVerify, "multispace", "\"multi  space\"",
                    "pre", "objectBox objectBox-string");

                // Errors
                FBTest.setPref("ObjectShortIteratorMax", 1);   // Related to R6588
                taskList.push(executeAndVerify, "blah",
                    /\s*ReferenceError: blah is not defined/,
                    "div", "logRow logRow-errorMessage");

                // Assignment
                taskList.push(executeAndVerify, "var blah = 'oink';",
                    ">>> var blah = 'oink';",
                    "span", "objectBox objectBox-text");

                taskList.push(executeAndVerify, "blah", "\"oink\"",
                    "span", "objectBox objectBox-string");

                // DOM Elements
                taskList.push(executeAndVerify,
                    "document.getElementsByTagName('h1')[0]", "<h1>",
                    "a", "objectLink objectLink-element");

                // Run all tasks.
                taskList.run(function()
                {
                    FBTest.testDone();
                })
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
