function runTest()
{
    FBTest.sysout("issue2638.START");

    FBTest.openNewTab(basePath + "script/2638/issue2638.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("script");

        FBTest.enableScriptPanel(function(win)
        {
            // Set a breakpoint
            var lineNo = 10;
            var breakpointAttributes = {condition: "i == 5"};
            FBTest.setBreakpoint(null, null, lineNo, breakpointAttributes, function(row)
            {
                setTimeout(function(){
                FBTest.testDone("issue2638.DONE");
                },0);
            });
        });
    });
}