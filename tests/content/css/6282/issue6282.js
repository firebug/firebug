function runTest()
{
    FBTest.sysout("issue6282.START");

    FBTest.openNewTab(basePath + "css/6282/issue6282.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");

        FBTest.selectPanelLocationByName(panel, "issue6282.html");

        var rules = FBTest.getStyleRulesBySelector("#teststyle");

        FBTest.compare(2, rules.length, "There must be two style rules shown");
        FBTest.testDone("issue6282; DONE");
    });
}
