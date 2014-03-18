

function allOpenAllClose()
{
    FBTest.progress("All Close");
    if (FW.Firebug.PanelActivation)
        FW.Firebug.PanelActivation.toggleAll("off");
    else
        FW.Firebug.Activation.toggleAll("off");

    window.allOpenAllCloseURL = FBTest.getHTTPURLBase()+"firebug/OpenFirebugOnThisPage.html";

    FBTest.openNewTab(allOpenAllCloseURL, function openFirebug(win)
    {
        FBTest.progress("opened tab for "+win.location);

        var open = FW.Firebug.chrome.isOpen();
        FBTest.ok(!open, "Firebug starts closed");

        FBTest.progress("All Open");
        if (FW.Firebug.PanelActivation)
            FW.Firebug.PanelActivation.toggleAll("on");
        else
            FW.Firebug.Activation.toggleAll("on");

        allOpened();  // allow UI to come up then check it
    });
}

function allOpened()
{
    var placement = FBTest.getFirebugPlacement();
    FBTest.compare("inBrowser", placement, "Firebug now open in browser");

    if (FBTest.FirebugWindow.Firebug.currentContext)
    {
        var contextName = FBTest.FirebugWindow.Firebug.currentContext.getName();
        /*
        var cL = contextName.length;
        var aL =  allOpenAllCloseURL.length;
        FBTest.compare(aL+"", cL+"", "chromeWindow.Firebug.currentContext has same length"+contextName);
        for (var i = 0; i < allOpenAllCloseURL.length; i++)
            if ( allOpenAllCloseURL[i] != contextName[i] ) FBTest.progress("compare fails at "+i+" "+ allOpenAllCloseURL[i]);
            */
        FBTest.compare(allOpenAllCloseURL+"", contextName+"", "Firebug.currentContext set to "+allOpenAllCloseURL);
    }
    else
        FBTest.ok(false, "no Firebug.currentContext");

    FBTest.openNewTab(basePath + "firebug/AlsoOpenFirebugOnThisPage.html", alsoOpened);
}

function alsoOpened(win)
{
    FBTest.progress("Opened "+win.location);

    var placement = FBTest.getFirebugPlacement();
    FBTest.compare("inBrowser", placement, "Firebug opened because of all open");

    FBTest.pressToggleFirebug();  // toggle to minimize

    var placement = FBTest.getFirebugPlacement();
    FBTest.compare("minimized", placement, "Firebug minimized");

    var statusbarIcon = FW.top.document.getElementById('firebugStatus');

    var toolTip = statusbarIcon.getAttribute("tooltiptext");
    var number = /^(\d).*Firebugs/.exec(toolTip);
    if (number)
        FBTest.compare("2", number[1], "Should be 2 Firebugs now");

    if (FW.Firebug.PanelActivation)
        FW.Firebug.PanelActivation.toggleAll("off");
    else
        FW.Firebug.Activation.toggleAll("off");

    var open = FW.Firebug.chrome.isOpen();
    FBTest.ok(!open, "Firebug closed by all off");

    var toolTip = statusbarIcon.getAttribute("tooltiptext");
    var number = /^(\d).*Firebugs/.exec(toolTip);
    FBTest.ok(!number, "Should be no Firebugs now");

    if (FW.Firebug.PanelActivation)
        FW.Firebug.PanelActivation.toggleAll("none");
    else
        FW.Firebug.Activation.toggleAll("none");



    FBTest.testDone();
}

//------------------------------------------------------------------------
// Auto-run test

function runTest()
{
    FBTest.sysout("allOpenAllClose.started");

    if (FBTest.FirebugWindow)
        FBTest.ok(true, "We have the Firebug Window: "+FBTest.FirebugWindow.location);
    else
        FBTest.ok(false, "No Firebug Window");

    // Auto run sequence
    allOpenAllClose();
}
