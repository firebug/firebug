function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/monitorEvents.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var taskList = new FBTest.TaskList();

                taskList.push(executeAndVerify, win, "'click'", ["click"],
                    [/^click\s+clientX=\d+,\s+clientY=\d+$/]);

                taskList.push(executeAndVerify, win, "'key'", ["click", "key"],
                    [/^click\s+clientX=\d+,\s+clientY=\d+$/, /^keydown\s+charCode=\d+,\s+keyCode=\d+$/,
                     /^keypress\s+charCode=\d+,\s+keyCode=\d+$/, /^keyup\s+charCode=\d+,\s+keyCode=\d+$/]);

                taskList.push(executeAndVerify, win, "['click', 'key']", ["click", "key"],
                    [/^click\s+clientX=\d+,\s+clientY=\d+$/, /^keydown\s+charCode=\d+,\s+keyCode=\d+$/,
                     /^keypress\s+charCode=\d+,\s+keyCode=\d+$/, /^keyup\s+charCode=\d+,\s+keyCode=\d+$/]);

                taskList.push(executeAndVerify, win, null, ["click", "key"],
                    [/^click\s+clientX=\d+,\s+clientY=\d+$/, /focus/,
                     /^keydown\s+charCode=\d+,\s+keyCode=\d+$/, /^keypress\s+charCode=\d+,\s+keyCode=\d+$/,
                     /^keyup\s+charCode=\d+,\s+keyCode=\d+$/]);

                taskList.run(function()
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
function executeAndVerify(callback, win, eventTypes, actions, expected)
{
    var config = {tagName: "a", classes: "objectLink objectLink-eventLog", counter: expected.length};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var panelNode = FBTest.getPanel("console").panelNode;
        var rows = panelNode.getElementsByClassName("objectLink-eventLog");
        for (var i = 0; i < expected.length; i++)
        {
            FBTest.compare(expected[i], rows[i].textContent, "Verify: " +
                rows[i].textContent + " should be " + expected[i]);
        }

        FBTest.clickToolbarButton(null, "fbConsoleClear");
        callback();
    });

    var expression = "monitorEvents(document.getElementById(\"monitoredElement\")";
    if (eventTypes)
        expression += ", "+eventTypes;
    expression += ")";
    FBTest.executeCommand(expression);
    for (var i = 0; i < actions.length; i++)
    {
        switch(actions[i])
        {
            case "click":
                FBTest.click(win.document.getElementById("monitoredElement"));
                break;

            case "key":
                win.document.getElementById("monitoredElement").focus();
                FBTest.synthesizeKey("a", null, win);
                break;
        }
    }
}
