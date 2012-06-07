function runTest()
{
    FBTest.sysout("cookies.test.breakOnNext; START");

    FBTestFirebug.openNewTab(basePath + "general/breakOnNext.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            // xxxHonza TODO:

            FBTestFirebug.testDone("cookies.test.breakOnNext; DONE");
        });
    });
};

function clickBreakOnCookie()
{
    var chrome = FW.Firebug.chrome;
    FBTestFirebug.clickBreakOnNextButton(chrome);
}

function waitForBreakOnCookie(lineNo, breakpoint, callback)
{
    var chrome = FW.Firebug.chrome;
    FBTestFirebug.waitForBreakInDebugger(chrome, lineNo, breakpoint, function(sourceRow)
    {
        FBTest.sysout("net.breakpoints; Break on Cookie OK");
        FBTestFirebug.clickContinueButton(chrome);
        callback();
    });
}
