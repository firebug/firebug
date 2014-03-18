function runTest()
{
    FBTest.openNewTab(basePath + "html/4670/issue4670.xml", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");
            var hiddenNodes = panel.panelNode.getElementsByClassName("nodeHidden");
            FBTest.compare(0, hiddenNodes.length, "All nodes must be expanded");

            FBTest.testDone();
        });
    });
}