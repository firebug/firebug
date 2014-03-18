// xxxHonza: this test-driver is not finished (read the test description)
function runTest()
{
    var url = basePath + "script/2638/issue2638.html";
    FBTest.openNewTab(url, function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var breakpointAttributes = {condition: "i == 5"};
            FBTest.setBreakpoint(null, url, 10, breakpointAttributes, function(row)
            {
                FBTest.testDone();
            });
        });
    });
}