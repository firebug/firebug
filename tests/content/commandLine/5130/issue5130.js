function runTest()
{
    FBTest.sysout("issue5130.START");
    FBTest.openNewTab(basePath + "commandLine/5130/issue5130.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.clearCache();
        FBTest.enableConsolePanel(function(win)
        {
            var tasks = new FBTest.TaskList();

            var expr = "console.dir([0,1,2,3,4,5,6,7,8,9,10]);";
            var expected = /\s*00\s*11\s*22\s*33\s*44\s*55\s*66\s*77\s*88\s*99\s*1010/;
            tasks.push(FBTest.executeCommandAndVerify, expr, expected,
                "div", "logRow logRow-dir");

            tasks.run(function() {
                FBTest.testDone("issue5130.DONE");
            });
        });
    });
}
