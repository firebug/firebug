/**
 * 1) Open a new tab and Firebug on it.
 * 2) Disable Console panel
 * 3) Verify visibility of the command line (must be collapsed).
 */
function runTest()
{
    FBTest.sysout("panelContentAfterDisable.START");
    FBTest.openNewTab(basePath + "firebug/OpenFirebugOnThisPage.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function()
        {
            FBTest.disableConsolePanel(function()
            {
                var cmdBox = FW.Firebug.chrome.$("fbCommandBox");
                var splitter = FW.Firebug.chrome.$("fbPanelSplitter");
                var sidePanel = FW.Firebug.chrome.$("fbSidePanelDeck");

                FBTest.ok(cmdBox.collapsed, "Command line must be hidden");
                FBTest.ok(splitter.collapsed, "Splitter must be hidden");
                FBTest.ok(sidePanel.collapsed, "Large command line must be hidden");

                FBTest.testDone("panelContentAfterDisable.DONE");
            });
        });
    });
}
