// xxxHonza: this test-driver is not finished (read the test description) 
function runTest()
{
    FBTest.sysout("issue2638.START");

    FBTest.openNewTab(basePath + "script/2638/issue2638.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var lineNo = 10;
            var breakpointAttributes = {condition: "i == 5"};
            FBTest.setBreakpoint(null, null, lineNo, breakpointAttributes, function(row)
            {
                FBTest.testDone("issue2638.DONE");
            });
        });
    });
}