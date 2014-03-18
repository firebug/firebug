function runTest()
{
    FBTest.openNewTab(basePath + "css/6282/issue6282.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue6282.html");

            var rules = FBTest.getStyleRulesBySelector("#teststyle");

            FBTest.compare(2, rules.length, "There must be two style rules shown");
            FBTest.testDone();
        });
    });
}
