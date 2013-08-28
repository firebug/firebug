function runTest()
{
    FBTest.sysout("commandline.profile.START");
    FBTest.openNewTab(basePath + "commandLine/api/profile.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel();

        var expectedWarning = FW.FBL.$STR("ProfilerRequiresTheScriptPanel");
        FBTest.executeCommandAndVerify(function()
        {
            FBTest.enableScriptPanel(function(win)
            {
                var config = {tagName: "table", classes: "profileTable"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.testDone("commandline.profile.DONE");
                });

                FBTest.executeCommand("profile()");
                FBTest.click(win.document.getElementById("testButton"));
                FBTest.executeCommand("profileEnd()");
            });
        }, "profile();", expectedWarning, "div", "logRow-warn", true);
    });
}
