function runTest()
{
    FBTest.openNewTab(basePath + "script/1575/issue1575.htm", function(win)
    {
        FBTest.progress("issue1575 opens "+win.location);
        FBTest.selectPanel("script");

        FBTest.enableScriptPanel(function()
        {
            FBTest.selectPanel("script");
            FBTest.progress("reloaded, now set breakpoint");

            var panel = FW.Firebug.chrome.getSelectedPanel();
            FBTest.compare("script", panel.name, "Got selected panel "+panel.name);

            var lineNo = 3;
            FBTest.selectSourceLine(basePath + "script/1575/issue1575.js", lineNo, "js")

            panel.toggleBreakpoint(lineNo);
            FBTest.progress("toggled breakpoint on line "+lineNo);

            // use chromebug to see the elements that make up the row
            var sourceRow = FBTest.getSourceLineNode(lineNo);
            FBTest.compare("true", sourceRow.getAttribute('breakpoint'), "Line "+lineNo+
                " should have a breakpoint set");

            var chrome = FW.Firebug.chrome;
            FBTest.waitForBreakInDebugger(chrome, lineNo, true, function hitBP()
            {
                FBTest.progress("Remove breakpoint now");
                var panel = chrome.getSelectedPanel();
                panel.toggleBreakpoint(lineNo);

                var row = FBTest.getSourceLineNode(lineNo, chrome);
                if (!FBTest.compare("false", row.getAttribute('breakpoint'), "Line "+ lineNo+
                    " should NOT have a breakpoint set"))
                {
                    FBTest.sysout("Failing row is "+row.parentNode.innerHTML, row)
                }

                checkWatchPanel();
            });

            FBTest.progress("Breakpoint Listener set, run the function");
            // Execute test method and hit the breakpoint.
            win.setTimeout("issue1575GlobalFunction()");
        });
    })
}

function checkWatchPanel()
{
    var chrome = FW.Firebug.chrome;
    var panel = chrome.selectSidePanel("watches");
    var panelNode = panel.panelNode;
    var watchNewRow = FW.FBL.getElementByClass(panelNode, "watchEditBox");

    FBTest.progress("now click on the box "+watchNewRow.innerHTML);

    // Click on the "New watch expression..." edit box to start editing.
    FBTest.mouseDown(watchNewRow);

    setTimeout(function checkEditing()
    {
        FBTest.ok(panel.editing, "The Watch panel must be in an 'editing' mode now.");
        FBTest.clickContinueButton(chrome);
        FBTest.testDone("issue1575.DONE");
    }, 100);
}
