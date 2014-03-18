function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/4132/issue4132.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("computed");

            FBTest.selectElementInHtmlPanel("element", function(win)
            {
                var computedStyles = panel.panelNode.querySelectorAll(".computedStyle:not(.hasSelectors)");

                FBTest.compare(0, computedStyles.length, "There should not be any user agent styles be shown.");

                FBTest.setPref("showUserAgentCSS", true);

                computedStyles = panel.panelNode.querySelectorAll(".computedStyle:not(.hasSelectors)");

                FBTest.ok(computedStyles.length > 0, "There should be user agent styles shown.");

                FBTest.testDone();
            });
        });
    });
}
