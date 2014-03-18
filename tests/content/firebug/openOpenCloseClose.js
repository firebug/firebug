


function openOpenCloseClose()
{
    var openOpenCloseCloseURL = FBTest.getHTTPURLBase()+"firebug/OpenFirebugOnThisPage.html";

    FBTest.openNewTab(openOpenCloseCloseURL, function openFirebug(win)
    {
        FBTest.progress("opened tab for "+win.location);

        var open = FW.Firebug.chrome.isOpen();
        FBTest.ok(!open, "Firebug starts closed");

        FBTest.progress("Press the toggle Firebug");
        FBTest.pressToggleFirebug();

        var placement = FBTest.getFirebugPlacement();
        FBTest.compare("inBrowser", placement, "Firebug now open inBrowser");

        if (FBTest.FirebugWindow.Firebug.currentContext)
        {
            var contextName = FBTest.FirebugWindow.Firebug.currentContext.getName();
            FBTest.ok(true, "chromeWindow.Firebug.currentContext "+contextName);
            FBTest.ok(contextName == openOpenCloseCloseURL, "Firebug.currentContext set to "+openOpenCloseCloseURL);
        }
        else
            FBTest.ok(false, "no Firebug.currentContext");

        FBTest.progress("Press the toggle Firebug");
        FBTest.pressToggleFirebug();

        var placement = FBTest.getFirebugPlacement();
        FBTest.compare("minimized", placement, "Firebug minimizes");

        FBTest.progress("Press the toggle Firebug");
        FBTest.pressToggleFirebug();

        placement = FBTest.getFirebugPlacement();
        FBTest.compare("inBrowser", placement, "Firebug reopens inBrowser");

        FBTest.progress("Close Firebug");
        FBTest.closeFirebug();

        var open = FW.Firebug.chrome.isOpen();
        FBTest.ok(!open, "Firebug closed");

        FBTest.testDone();
    });
}



//------------------------------------------------------------------------
// Auto-run test

function runTest()
{
    FBTest.sysout("Activation.started");
    FBTest.sysout("activation.js FBTest", FBTest);

    if (FBTest.FirebugWindow)
        FBTest.ok(true, "We have the Firebug Window: "+FBTest.FirebugWindow.location);
    else
        FBTest.ok(false, "No Firebug Window");

    // Auto run sequence
    openOpenCloseClose();
}
