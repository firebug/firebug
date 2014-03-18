function runTest()
{
    FBTest.openNewTab(basePath + "script/watch/5009/issue5009.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var panel = FBTest.selectSidePanel("watches");

            var watchNewRow = panel.panelNode.getElementsByClassName("watchEditBox").item(0);
            FBTest.ok(watchNewRow, "The watch edit box must be there");

            FBTest.mouseDown(watchNewRow);

            var editor = panel.panelNode.getElementsByClassName("fixedWidthEditor").item(0);
            FBTest.ok(editor, "The editor must be there");

            FBTest.testDone();
        });
    });
}
