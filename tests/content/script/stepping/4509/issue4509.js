function runTest()
{
    FBTest.openNewTab(basePath + "script/stepping/4509/issue4509.html", function(win)
    {
        FBTest.enablePanels("script", "console", function()
        {
            var tasks = new FBTest.TaskList();
            tasks.push(testViaContextMenu);
            tasks.push(testViaCtrlClick);

            // xxxHonza: sending middle click event breaks the test-harness.
            // All the following test from script/watch group fails
            //tasks.push(testViaMiddleClick);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function testViaContextMenu(callback)
{
    FBTest.waitForBreakInDebugger(null, 10, false, function(row)
    {
        // Get row 12
        var sourceRow = row.nextSibling.nextSibling.
            getElementsByClassName("sourceRowText").item(0);

        // Register break-listener before executing the context menu
        // command. The callback for executeContextMenuCommand is called
        // asynchronously and we could miss the break.
        FBTest.waitForBreakInDebugger(null, 12, false, function(row)
        {
            verifyResults(row, callback);
        });

        FBTest.executeContextMenuCommand(sourceRow, {id: "contextMenuRunUntil"});
    });

    FBTest.reload();
}

function testViaCtrlClick(callback)
{
    FBTest.waitForBreakInDebugger(null, 10, false, function(row)
    {
        // Get row 12
        var row12 = row.nextSibling.nextSibling;

        FBTest.waitForBreakInDebugger(null, 12, false, function(row)
        {
            verifyResults(row, callback);
        });
        FBTest.sendMouseEvent({type: "mousedown", ctrlKey: true}, row12.firstChild);
    });

    FBTest.reload();
}

function testViaMiddleClick(callback)
{
    FBTest.waitForBreakInDebugger(null, 10, false, function(row)
    {
        // Get row 12
        var row12 = row.nextSibling.nextSibling;

        FBTest.waitForBreakInDebugger(null, 12, false, function(row)
        {
            verifyResults(row, callback);
        });

        FBTest.sendMouseEvent({type: "mousedown", button: 1}, row12.firstChild);
    });

    FBTest.reload();
}

//************************************************************************************************

function verifyResults(row, callback)
{
    var config = {tagName: "div", classes: "logRow logRow-log"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var expected = "That's the first log line.";
        var logRow = row.getElementsByClassName("objectBox objectBox-text").item(0);
        FBTest.compare(expected, logRow.textContent, "Console panel must have '"+
            expected+"' as output");

        FBTest.waitForDebuggerResume(function()
        {
            callback();
        });

        FBTest.clickContinueButton();
    });

    FBTest.selectPanel("console");
}