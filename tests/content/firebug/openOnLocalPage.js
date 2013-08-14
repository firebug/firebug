// Test entry point.
function runTest()
{
    FBTest.sysout("openOnLocalPage.START");
    FBTest.openNewTab(basePath + "firebug/openOnLocalPage.html", function(win)
    {
        // Open Firebug UI and reload the page.
        FBTest.openFirebug();
        FBTest.sysout("openOnLocalPage reloading");
        FBTest.reload(function(win)
        {
            FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened now.");
            FBTest.testDone("openOnLocalPage.DONE");
        });
    });
}
