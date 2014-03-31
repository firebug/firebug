function runTest()
{
    if (FBTest.FirebugWindow)
        FBTest.ok(true, "We have the Firebug Window: "+FBTest.FirebugWindow.location);
    else
        FBTest.ok(false, "No Firebug Window");

    FBTest.openNewTab(basePath + "firebug/NeverOpenFirebugOnThisPage.html", function(win)
    {
        FBTest.sysout("onNewPage starts");
        FBTest.ok(!FBTest.isFirebugOpen(), "Firebug should be closed");
        FBTest.testDone();
    });
}
