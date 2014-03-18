function runTest()
{
    FBTest.openNewTab(basePath + "css/5430/issue5430.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue5430.html");

            var rows = FW.FBL.getElementsByClass(panel.panelNode, "cssNamespaceRule");
            if (FBTest.compare(2, rows.length, "There must be two @namespace rules"))
            {
                FBTest.compare(/@namespace\s\"http:\/\/www\.w3\.org\/1999\/xhtml\";/, rows[0].textContent,
                    "The namespace rule must be correct");
                FBTest.compare(/@namespace\ssvg\s\"http:\/\/www\.w3\.org\/2000\/svg\";/, rows[1].textContent,
                    "The namespace rule must be correct");
            }

            FBTest.testDone();
        });
    });
}
