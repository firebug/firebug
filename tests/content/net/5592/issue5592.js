// Test entry point. Every test driver needs to implement this function.
// It's automatically executed by Firebug test harness (FBTest).
function runTest()
{
    // Open a new tab with the test page. 'basePath' variable is provided
    // by test harness.
    FBTest.openNewTab(basePath + "net/5592/issue5592.html", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Wait till a 'HTTP request' entry is displayed in the Net panel.
            FBTest.waitForDisplayedElement("net", options, function(row)
            {
                FBTest.sysout("issue5592.response received");

                // Create list of asynchronous tasks, see:
                // https://getfirebug.com/wiki/index.php/Firebug_Automated_Test_Examples#Example:_Asynchronous_tasks_within_a_test
                var tasks = new FBTest.TaskList();

                // There are two async operation.
                // 1) Copy URL Parameters to the clipboard and verify
                // 1) Copy POST Parameters to the clipboard and verify
                tasks.push(executeAndVerify, row, "fbCopyUrlParameters",
                    /v1=d1\s*v2=d2/);
                tasks.push(executeAndVerify, row, "fbCopyPOSTParameters",
                    /value1=param1\s*value2=param2/);

                // Run both async tasks
                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });

            // Run test implemented on the page by clicking on the
            // test button.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

// The first 'callback' parameter is passed automatically by
// FBTest.TaskList object. As soon as the function finishes
// its asynchronous job, the callback must be executed to
// allow the next registered task to be started.
function executeAndVerify(callback, target, actionID, expected)
{
    function executeContextMenuCommand()
    {
        // Open context menu on the specified target
        FBTest.executeContextMenuCommand(target, actionID);
    }

    // Data can be copyied into the clipboard asynchronously,
    // so wait till they are available.
    FBTest.waitForClipboard(expected, executeContextMenuCommand, (text) =>
    {
        // Verify data in the clipboard
        FBTest.compare(expected, text,
            "Proper data must be in the clipboard. Current: " + text);
        callback();
    });
}
