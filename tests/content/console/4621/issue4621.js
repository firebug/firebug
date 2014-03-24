function runTest()
{
    FBTest.sysout("issue4621.START");

    FBTest.openNewTab(basePath + "console/4621/issue4621.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Enable and switch to the Console panel
            // 3. Reload the page
            FBTest.enableConsolePanelAndReload(function()
            {
                // Show all messages
                clickToolbarButton("fbConsoleFilter-all", false);

                // 4. Click the 'Info' filter button
                clickToolbarButton("fbConsoleFilter-info", false);

                // 5. Hold down Ctrl and click the 'Warnings' filter button
                clickToolbarButton("fbConsoleFilter-warning", true);

                // Wait for the log messages to be filtered
                win.setTimeout(function()
                {
                    var panelNode = FBTest.getSelectedPanel().panelNode;
                    var logRows = Array.prototype.slice.call(
                        panelNode.getElementsByClassName("logRow"));

                    var shownLogRows = logRows.filter((logRow) =>
                    {
                        var cs = win.getComputedStyle(logRow);
                        return cs.display !== "none";
                    });

                    FBTest.compare(2, shownLogRows.length, "Two of the four rows should be shown");

                    // Reset the filter
                    clickToolbarButton("fbConsoleFilter-all", false);

                    FBTest.testDone();
                }, 200);
            });
        });
    });
}

//********************************************************************************************* //
//Helpers

function clickToolbarButton(buttonID, ctrlKey)
{
    var doc = FW.Firebug.chrome.window.document;
    var button = doc.getElementById(buttonID);
    FBTest.sysout("Click toolbar button " + buttonID, button);

    var eventDetails = {ctrlKey: ctrlKey};
    FBTest.synthesizeMouse(button, 4, 4, eventDetails);
}
