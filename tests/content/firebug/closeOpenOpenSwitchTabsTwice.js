// Test entry point.
function runTest()
{
    FBTest.sysout("closeOpenOpenSwitchTabsTwice.START");

    FBTest.enableAllPanels();
    FBTest.closeFirebugOnAllTabs(); // use the existing tab as the "no Firebug tab"

    FBTest.setPref("activateSameOrigin", false);
    FBTest.progress("The Activate Same Origin Option is false for this test");

    var tabbrowser = FBTest.getBrowser();
    var noFirebugTab = tabbrowser.selectedTab;

    FBTest.openNewTab(basePath + "firebug/NeverOpenFirebugOnThisPage.html", function(win)
    {
        FBTest.progress("Opened reference window that will not have Firebug");

        var openedPage = basePath + "firebug/OpenFirebugOnThisPage.html";

        FBTest.progress("Open window that will have Firebug");

        FBTest.openNewTab(openedPage, function(win)
        {
            FBTest.progress("Now open Firebug UI in this new tab");
            FBTest.openFirebug();

            var theFirebuggedTab = tabbrowser.selectedTab;

            FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be open.");

            FBTest.progress("Switch back to the first tab.");
            tabbrowser.selectedTab = noFirebugTab;

            FBTest.ok(!FBTest.isFirebugOpen(), "Firebug UI must be closed.");

            checkIconOff('console');
            checkIconOff('script');
            checkIconOff('net');

            FBTest.progress("Switch again, to the Firebugged tab");

            tabbrowser.selectedTab = theFirebuggedTab;
            FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened now.");

            checkIconOn('console');
            checkIconOn('script');
            checkIconOn('net');

            FBTest.compare(openedPage, FW.Firebug.currentContext.getName(), "The context should be "+openedPage);

            var alsoOpened = basePath+"firebug/AlsoOpenFirebugOnThisPage.html";
            FBTest.openNewTab(alsoOpened, function(win)
            {
                FBTest.progress("Also open Firebug on "+alsoOpened);
                FBTest.openFirebug();
                FBTest.compare(alsoOpened, FW.Firebug.currentContext.getName(), "The context should be "+alsoOpened);

                FBTest.progress("Switch Back to a tab that had Firebug open");
                tabbrowser.selectedTab = theFirebuggedTab;
                FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened now.");
                FBTest.compare(openedPage, FW.Firebug.currentContext.getName(), "The context should be "+openedPage);

                FBTest.testDone("closeOpenOpenSwitchTabsTwice.DONE");
            });
        });
    });
}

function checkIconOff(panelName)
{
    var icon = FW.top.document.getElementById("firebugStatus").getAttribute(panelName);
    FBTest.ok(!icon || (icon != "on"), "The " + panelName +
        " should NOT be marked on the Firebug Statusbar Icon, it is " + icon);
}

function checkIconOn(panelName)
{
    var icon = FW.top.document.getElementById('firebugStatus').getAttribute(panelName);
    FBTest.compare(icon+"", "on", "The "+panelName+" should be marked on the Firebug Statusbar Icon");}