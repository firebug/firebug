function runTest()
{
    FBTest.openNewTab(basePath + "script/1575/issue1575.htm", function(win)
    {
        FBTest.progress("issue1575 opens " + win.location);
        FBTest.selectPanel("script");

        FBTest.enableScriptPanel(function(win)
        {
            FBTest.progress("reloaded, now set breakpoint");

            var chrome = FW.Firebug.chrome;

            var lineNo = 3;
            var url = basePath + "script/1575/issue1575.js";
            FBTest.setBreakpoint(chrome, url, lineNo, null, function(row)
            {
                FBTest.waitForBreakInDebugger(chrome, lineNo, true, function()
                {
                    FBTest.progress("Breakpoint hit");

                    checkWatchPanel();
                });

                FBTest.progress("Breakpoint Listener set, run the function");

                // Execute test method and hit the breakpoint.
                FBTest.clickContentButton(win, "testButton");
            });
        });
    })
}

function checkWatchPanel()
{
    var chrome = FW.Firebug.chrome;
    var panel = chrome.selectSidePanel("watches");
    var panelNode = panel.panelNode;
    var watchNewRow = FW.FBL.getElementByClass(panelNode, "watchEditBox");

    FBTest.progress("now click on the box " + watchNewRow.innerHTML);

    // Click on the "New watch expression..." edit box to start editing.
    FBTest.mouseDown(watchNewRow);

    setTimeout(function checkEditing()
    {
        FBTest.ok(panel.editing, "The Watch panel must be in an 'editing' mode now.");
        FBTest.clickContinueButton(chrome);
        FBTest.testDone();
    }, 100);
}
