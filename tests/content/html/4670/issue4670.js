function runTest()
{
    FBTest.sysout("issue4670.START");
    FBTest.openNewTab(basePath + "html/4670/issue4670.xml", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("html");

        var hiddenNodes = panel.panelNode.getElementsByClassName("nodeHidden");
        FBTest.compare(0, hiddenNodes.length, "All nodes must be expanded");

        FBTest.testDone("issue4670.DONE");
    });
}