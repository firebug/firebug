function runTest()
{
    FBTest.openNewTab(basePath + "console/grouping/simpleLogs.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                tasks.push(verifyLogs, win, 12, 2, "testButton1", "Verify grouped logs");
                tasks.push(verifyLogs, win, 51, "", "testButton2", "Verify not grouped logs");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function verifyLogs(callback, win, numberOfLogs, expectedCounterValue, buttonId, message)
{
    FBTest.progress(message);

    FBTest.clearConsole();

    var config = {
        tagName: "div",
        classes: "logRow",
        counter: numberOfLogs
    };

    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        // Let any additional logs to be created (which would be wrong,
        // but we want to catch such case too).
        setTimeout(function()
        {
            onVerify(callback, numberOfLogs, expectedCounterValue);
        }, 200);
    });

    FBTest.click(win.document.getElementById(buttonId));
}

function onVerify(callback, numberOfLogs, expectedCounterValue)
{
    var panelNode = FBTest.getPanel("console").panelNode;

    // Iterate over all counters and check that they are equal to 2
    var rows = panelNode.getElementsByClassName("logCounter");
    FBTest.compare(numberOfLogs, rows.length, "There must be an expected number of logs");

    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];

        var isNumberType = typeof(expectedCounterValue) == "number";
        var actual = isNumberType ? parseInt(row.textContent, 10) : row.textContent;

        // Log only failures
        if (expectedCounterValue !== actual)
            FBTest.compare(expectedCounterValue, actual, "The log counter must match");
    }

    callback();
}
