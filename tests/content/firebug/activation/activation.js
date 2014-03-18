function runTest()
{
    FBTest.enableAllPanels();

    // Use the existing tab as the "no Firebug tab"
    FBTest.closeFirebugOnAllTabs();

    FBTest.setPref("activateSameOrigin", false);
    FBTest.progress("The Activate Same Origin Option is false for this test");

    var tabBrowser = FBTest.getBrowser();
    var noFirebugTab = tabBrowser.selectedTab;

    FBTest.openNewTab(basePath + "firebug/activation/noFirebug.html", function(win)
    {
        FBTest.progress("Opened reference window that will not have Firebug");

        var pageWithFirebug = basePath + "firebug/activation/firebugOpen.html";

        FBTest.progress("Open window that will have Firebug");

        FBTest.openNewTab(pageWithFirebug, function(win)
        {
            FBTest.progress("Now open the Firebug UI in this new tab");
            FBTest.openFirebug(function()
            {
                var tabWithFirebug = tabBrowser.selectedTab;

                FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be open");

                FBTest.progress("Switch back to the first tab");
                tabBrowser.selectedTab = noFirebugTab;
                FBTest.ok(!FBTest.isFirebugOpen(), "Firebug UI must be closed now");

                checkPanelActivation("console", false);
                checkPanelActivation("script", false);
                checkPanelActivation("net", false);

                FBTest.progress("Switch again to the tab with Firebug");

                tabBrowser.selectedTab = tabWithFirebug;
                FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened now");

                checkPanelActivation("console", true);
                checkPanelActivation("script", true);
                checkPanelActivation("net", true);

                FBTest.compare(pageWithFirebug, FW.Firebug.currentContext.getName(),
                    "The context should be '" + pageWithFirebug + "'");

                var secondPageWithFirebug = basePath+"firebug/activation/firebugAlsoOpen.html";
                FBTest.openNewTab(secondPageWithFirebug, function(win)
                {
                    FBTest.progress("Also open Firebug on " + secondPageWithFirebug);
                    FBTest.openFirebug(function()
                    {
                        FBTest.compare(secondPageWithFirebug, FW.Firebug.currentContext.getName(),
                                "The context should be '" + secondPageWithFirebug + "'");

                        FBTest.progress("Switch back to the tab that had Firebug open");
                        tabBrowser.selectedTab = tabWithFirebug;
                        FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened now");
                        FBTest.compare(pageWithFirebug, FW.Firebug.currentContext.getName(),
                            "The context should be '" + pageWithFirebug + "'");

                        FBTest.testDone();
                    });
                });
            });
        });
    });
}

function checkPanelActivation(panelName, activated)
{
    var status = FW.top.document.getElementById("firebugStatus").getAttribute(panelName);
    if (activated)
    {
        FBTest.compare("on", status, "The " + panelName + " panel should be displayed as " +
            "activated in the Firebug Start Button infotip");
    }
    else
    {
        FBTest.ok(!status || status === "off", "The " + panelName + " panel should be displayed as " +
            "deactivated in the Firebug Start Button infotip" +
            (status && status !== "off" ? ", was '" + status + "'" : ""));
    }
}
