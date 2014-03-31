function runTest()
{
    FBTest.openNewTab(basePath + "firebug/4040/issue4040.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");
            FBTest.compare(1, getNumberOfRules(panel), "There must be one CSS rule");

            FBTest.openNewTab("about:blank", function(win)
            {
                FBTest.openFirebug(function()
                {
                    var panel = FBTest.selectPanel("stylesheet");
                    FBTest.compare(0, getNumberOfRules(panel), "There must be no CSS rule");

                    FBTest.testDone();
                });
            });
        });
    });
}

function getNumberOfRules(panel)
{
    var cssRule = panel.panelNode.querySelectorAll(".cssRule");
    FBTest.sysout("cssRule "+ cssRule.length);
    return cssRule ? cssRule.length : 0;
}
