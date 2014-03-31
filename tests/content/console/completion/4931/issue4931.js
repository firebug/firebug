function runTest()
{
    FBTest.openNewTab(basePath + "console/completion/4931/issue4931.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                executeAndVerify("a", "\"Hello\"", "span", "objectBox objectBox-string", function()
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
function executeAndVerify(expression, expected, tagName, classes, callback)
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
