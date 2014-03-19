// Test entry point.
function runTest()
{
    FBTest.openNewTab(basePath + "firebug/openOnLocalPage.html", function(win)
    {
        // Open Firebug UI and reload the page.
        FBTest.openFirebug(function()
        {
            FBTest.sysout("openOnLocalPage reloading");
            FBTest.reload(function(win)
            {
                FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened now.");
                FBTest.testDone();
            });
        });
    });
}
