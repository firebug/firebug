function runTest()
{
    FBTest.openNewTab(basePath + "script/watch/4934/issue4934.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.waitForBreakInDebugger(null, 17, false, function()
            {
                // Like FBTest.addWatchExpression

                var chrome = FW.Firebug.chrome;

                var watchPanel = FBTest.getPanel("watches", true);
                FBTest.ok(watchPanel, "The watch panel must be there");
                var panelNode = watchPanel.panelNode;
                var watchNewRow = panelNode.querySelector(".watchEditBox");
                FBTest.ok(watchNewRow, "The watch edit box must be there");
                FBTest.mouseDown(watchNewRow);

                var editor = panelNode.querySelector(".completionInput");
                FBTest.ok(editor, "The editor must be there");

                FBTest.sendString("argu", editor);
                FBTest.sendKey("TAB", editor);
                FBTest.compare("arguments", editor.value, "Must auto-complete 'argu' -> 'arguments'");

                FBTest.sendString(".cal", editor);
                FBTest.sendKey("TAB", editor);

                FBTest.compare("arguments.callee", editor.value, "Must auto-complete 'arguments.cal' -> 'arguments.callee'");

                // Resume debugger
                FBTest.clickContinueButton(null);

                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("executeTest"));
        });
    });
}
