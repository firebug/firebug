function runTest()
{
    FBTest.openNewTab(basePath + "cookies/general/breakOnNext.php", function(win)
    {
        FBTest.enablePanels(["cookies", "script"], function(win)
        {
            FBTest.progress("cookies panel enabled");

            var chrome = FW.Firebug.chrome;
            FBTest.clickBreakOnNextButton(chrome, function()
            {
                FBTest.progress("break on next clicked");

                FBTest.waitForBreakInDebugger(chrome, 94, false, function()
                {
                    FBTest.clickContinueButton(chrome);
                    FBTest.testDone();
                });
            });

            FBTest.clickContentButton(win, "changeCookie");
        });
    });
};
