function runTest()
{
    FBTest.openNewTab(basePath + "firebug/7036/issue7036.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.selectPanel("html");
                FBTest.selectPanel("console");
                var tasks = new FBTest.TaskList();

                tasks.push(window.setTimeout, 500);
                tasks.push(FBTest.executeCommandAndVerify, "1+1", "2", "span", "objectBox-number");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

