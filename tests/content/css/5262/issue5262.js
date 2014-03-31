function runTest()
{
    FBTest.openNewTab(basePath + "css/5262/issue5262.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue5262.html");

            var rows = FW.FBL.getElementsByClass(panel.panelNode, "cssCharsetRule");
            if (FBTest.compare(1, rows.length, "There must be one @charset rule"))
                FBTest.compare(/@charset\s\"UTF-8\";/, rows[0].textContent, "The @charset rule must be correct");

            FBTest.testDone();
        });
    });
}
