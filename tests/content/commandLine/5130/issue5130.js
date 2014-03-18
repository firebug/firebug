function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/5130/issue5130.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.clearCache();

            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();

                var expr = "console.dir([0,1,2,3,4,5,6,7,8,9,10]);";
                var expected = new RegExp("0\\s*0\\s*1\\s*1\\s*2\\s*2\\s*3\\s*3\\s*4\\s*4\\s*5\\s*5" +
                    "\\s*6\\s*6\\s*7\\s*7\\s*8\\s*8\\s*9\\s*9\\s*10\\s*10");
                tasks.push(FBTest.executeCommandAndVerify, expr, expected,
                    "div", "logRow logRow-dir");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}
