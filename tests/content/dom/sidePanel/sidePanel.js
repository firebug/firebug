function runTest()
{
    FBTest.openNewTab(basePath + "dom/sidePanel/sidePanel.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("domSide");
            var rows = panel.panelNode.getElementsByClassName("memberRow");

            FBTest.ok(rows.length > 0, "There must be some properties: " + rows.length);
            FBTest.testDone();
        });
    });
}
