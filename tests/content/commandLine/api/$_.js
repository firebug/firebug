function runTest()
{
    FBTest.sysout("$x_.START");

    FBTest.openNewTab(basePath + "commandLine/api/$x_.html", function(win)
    {
        FBTest.openFirebug();

        FBTest.enableConsolePanel(function(win)
        {
            var taskList = new FBTest.TaskList();

            taskList.push(FBTest.executeCommandAndVerify, "1+1",
                "2", "span", "objectBox objectBox-number");

            taskList.push(FBTest.executeCommandAndVerify, "$_",
                "2", "span", "objectBox objectBox-number");

            taskList.run(function() {
                FBTest.testDone("$x_.DONE");
            });
        });
    });
}
