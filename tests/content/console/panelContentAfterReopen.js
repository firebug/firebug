/**
 * 1) Open a new tab and Firebug on it.
 * 2) Select Enable Console panel.
 * 3) Print simple log into the Console panel (test-page.runTest)
 * 4) Close and open Firebug UI.
 * 5) Verify that the Console panel log is still there.
 */
function runTest()
{
    FBTest.openNewTab(basePath + "console/panelContentAfterReopen.html", function(win)
    {
        // Open Firebug UI and enable console panel.
        FBTest.enableConsolePanel(function()
        {
            var panelNode = FBTest.selectPanel("console").panelNode;
            FBTest.clickToolbarButton(null, "fbConsoleClear");

            FBTest.focus(FW.Firebug.chrome.$("fbCommandLine"));
            FBTest.click(win.document.getElementById("testButton"));

            FBTest.progress("Toggle Firebug Icon to hide UI");
            FBTest.pressToggleFirebug();  // toggle to minimize

            FBTest.progress("Toggle Firebug Icon to show UI");
            FBTest.pressToggleFirebug();  // toggle to restore
            setTimeout(function allowUIToUpdate(){
                var logRow = FW.FBL.getElementByClass(panelNode, "logRow logRow-log");
                var node = FW.FBL.getElementByClass(panelNode, "objectBox objectBox-text");
                FBTest.compare("Hello From Test!", (node?node.textContent:"null node"), "The log must be still there.");
                FBTest.testDone();
            }, 500);

        });
    });
}
