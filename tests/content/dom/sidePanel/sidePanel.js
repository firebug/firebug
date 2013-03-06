function runTest()
{
    FBTest.sysout("sidePanel.START");
    FBTest.openNewTab(basePath + "css/style/5654/issue5654.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        var panel = FBTest.selectSidePanel("domSide");
        var rows = panel.panelNode.querySelectorAll(".memberRow");

        FBTest.ok(rows.length > 0, "There must be some properties: " + rows.length);
        FBTest.testDone("sidePanel.DONE");
    });
}
