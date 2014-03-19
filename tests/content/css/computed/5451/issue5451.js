function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/5451/issue5451.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("computed");
            panel.panelNode.scrollTop = 100;

            FBTest.reload(function()
            {
                var panel = FBTest.selectSidePanel("computed");
                FBTest.compare(100, panel.panelNode.scrollTop, "Panel must be scrolled down 100 pixels");

                FBTest.testDone();
            });
        });
    });
}
