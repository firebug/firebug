function runTest()
{
    FBTest.openNewTab(basePath + "script/5044/issue5044.html", function(win)
    {
        FBTest.openFirebug(function () {
            FBTest.enableScriptPanel(function(win)
            {
                FBTest.sendShortcut("b", {accelKey: true, altKey: true});

                FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 10, false, function(row)
                {
                    FBTest.clickContinueButton();
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("sayHello"));
            });
        });
    });
}
