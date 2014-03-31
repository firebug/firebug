function runTest()
{
    FBTest.openNewTab(basePath + "cookies/general/breakOnNext.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            // xxxHonza TODO:

            FBTest.testDone();
        });
    });
};

function clickBreakOnCookie(callback)
{
    var chrome = FW.Firebug.chrome;
    FBTest.clickBreakOnNextButton(chrome, callback);
}

function waitForBreakOnCookie(lineNo, breakpoint, callback)
{
    var chrome = FW.Firebug.chrome;
    FBTest.waitForBreakInDebugger(chrome, lineNo, breakpoint, function(sourceRow)
    {
        FBTest.sysout("net.breakpoints; Break on Cookie OK");
        FBTest.clickContinueButton(chrome);
        callback();
    });
}
