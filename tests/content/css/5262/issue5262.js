function runTest()
{
    FBTest.sysout("issue5262.START");

    FBTest.openNewTab(basePath + "css/5262/issue5262.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");

        FBTest.selectPanelLocationByName(panel, "issue5262.html");

        var rows = FW.FBL.getElementsByClass(panel.panelNode, "cssCharsetRule");
        FBTest.compare(1, rows.length, "There must be one @charset rule");

        FBTest.testDone("issue5262.DONE");
    });
}
