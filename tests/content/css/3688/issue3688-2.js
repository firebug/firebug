function runTest()
{
    FBTest.sysout("issue3688-2.START");
    FBTest.openNewTab(basePath + "css/3688/issue3688-2.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");
        var warning = panel.panelNode.querySelector(".warning");
        FBTest.ok(warning, "There must be a warning: There are no rules ...");

        FBTest.reload(function(win)
        {
            var panel = FBTest.selectPanel("stylesheet");
            var warning = panel.panelNode.querySelector(".warning");
            FBTest.ok(warning, "The text must be still there...");

            FBTest.testDone("issue3688-2.DONE");
        })
    });
}
