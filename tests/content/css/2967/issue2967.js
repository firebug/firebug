function runTest()
{
    FBTest.openNewTab(basePath + "css/2967/issue2967.xml", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            if (FBTest.ok(FBTest.selectPanelLocationByName(panel, "issue2967.xml"), "The CSS Location Menu should contain an entry for 'issue2967.xml'"))
                FBTest.compare(/#rect\s*\{\s*fill:\s*url\("#linearGradient"\)\s*#000000;\s*\}/, panel.panelNode.textContent, "The panel should contain one SVG CSS rule");

            FBTest.testDone();
        });
   });
}