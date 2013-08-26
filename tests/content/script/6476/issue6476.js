function runTest()
{
    FBTest.openNewTab(basePath + "script/6476/issue6476.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.click(win.document.getElementById("testButtonEval"));

            var lineNo = 3;
            var fileUrl = basePath + "script/6476/issue6476-dynamic.js";
            FBTest.setBreakpoint(FW.Firebug.chrome, fileUrl, lineNo, null, function()
            {
                FBTest.waitForBreakInDebugger(null, lineNo, true, function hitBP()
                {
                    verifyLocation("issue6476-dynamic.js");

                    FBTest.testDone("issue4213.DONE");
                });

                FBTest.click(win.document.getElementById("testButtonExecute"));
            });
        });
    })
}

function verifyLocation(expected)
{
    var currenLocation = FBTest.getCurrentLocation();
    FBTest.compare(expected, currenLocation, "The location is: " + currenLocation);
}
