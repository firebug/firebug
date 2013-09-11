function runTest()
{
    FBTest.sysout("issue6522.START");
    FBTest.openNewTab(basePath + "commandLine/6522/issue6522.html", function(win)
    {
        FBTest.openFirebug();

        FBTest.selectPanel("console");
        FBTest.enableConsolePanel();
        FBTest.enableScriptPanel(function(win)
        {
            var taskList = new FBTest.TaskList();
            taskList.push(FBTest.executeCommandAndVerify, "getEventListeners(window).load[0].useCapture", "false",
                "span", "objectBox-number", true, false);
            taskList.push(FBTest.executeCommandAndVerify, "getEventListeners(window).load[1].useCapture", "true",
                "span", "objectBox-number", true, false);
            taskList.push(FBTest.executeCommandAndVerify, "getEventListeners(document.body).click[0].listener()",
                "0", "span", "objectBox-number", true, false);
            taskList.push(FBTest.executeCommandAndVerify, "getEventListeners(document.body).what.length",
                "1", "span", "objectBox-number", true, false);
            taskList.push(FBTest.executeCommandAndVerify, "getEventListeners(document.body).what[0].listener(1)",
                "2", "span", "objectBox-number", true, false);

            taskList.run(function()
            {
                FBTest.testDone("issue6522.DONE");
            });
        });
    });
}
