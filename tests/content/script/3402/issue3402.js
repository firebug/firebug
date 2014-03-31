function runTest()
{
    FBTest.openNewTab(basePath + "script/3402/issue3402.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var fileName = basePath + "script/3402/domplate.js";

            FBTest.setBreakpoint(null, fileName, 1069, null, function()
            {
                FBTest.progress("breakpoint set.");

                FBTest.selectPanel("html");

                FBTest.removeBreakpoint(null, fileName, 1069, function(row)
                {
                    FBTest.testDone();
                });
            });
        });
    });
}
