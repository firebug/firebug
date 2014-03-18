function runTest()
{
    FBTest.openNewTab(basePath + "console/3408/issue3408.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");

                var tasks = new FBTest.TaskList();
                tasks.push(testLog, win);
                tasks.push(closeFirebug);
                tasks.push(openFirebug);
                tasks.push(testLog, win);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function testLog(callback, win)
{
    var config = {tagName: "div", classes: "logRow logRow-log"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(/This is a test log\s*/, row.textContent,
            "The proper message must be displayed.");

        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}

function closeFirebug(callback)
{
    FBTest.clickToolbarButton(null, "fbCloseButton");
    callback();
}

function openFirebug(callback)
{
    FBTest.openFirebug(function()
    {
        callback();
    });
}
