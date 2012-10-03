function runTest()
{
    FBTest.sysout("commandline.cd.START");
    FBTest.openNewTab(basePath + "commandLine/api/cd.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.clearCache();
        FBTest.enableConsolePanel(function(win)
        {
            var tasks = new FBTest.TaskList();

            tasks.push(FBTest.executeCommandAndVerify, "cd(frames[0])",
                "[\"Current window:\", Window cdFrame.html]",
                "pre", "objectBox objectBox-array");

            tasks.push(FBTest.executeCommandAndVerify, "$(\"#test-iframe-1\")",
                /<div\s*id=\"test-iframe-1\">/,
                "a", "objectLink objectLink-element");

            tasks.push(FBTest.executeCommandAndVerify, "cd(top)",
                "[\"Current window:\", Window cd.html]",
                "pre", "objectBox objectBox-array");

            tasks.run(function() {
                FBTest.testDone("commandline.cd.DONE");
            });
        });
    });
}
