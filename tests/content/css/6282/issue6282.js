function runTest()
{
    FBTest.sysout("issue6282.START");

    FBTest.openNewTab(basePath + "css/6282/issue6282.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");

        FBTest.selectPanelLocationByName(panel, "issue6282.html");

        FBTest.searchInCssPanel("style1", function(node)
        {
            FBTest.testDone("issue6282; DONE");
        });
    });
}
