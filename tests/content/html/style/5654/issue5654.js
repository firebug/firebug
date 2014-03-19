function runTest()
{
    FBTest.openNewTab(basePath + "html/style/5654/issue5654.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("css");

            // Catch the first page load and Style panel update.
            waitForCssRules(function()
            {
                // Reload the page.
                FBTest.reload(function()
                {
                    // Catch the second style update
                    waitForCssRules(function()
                    {
                        FBTest.testDone();
                    });
                });
            });
        });
    });
}

function waitForCssRules(callback)
{
    var config = {tagName: "div", classes: "cssElementRuleContainer"};
    FBTest.waitForDisplayedElement("css", config, function(row)
    {
        var panel = FBTest.selectSidePanel("css");
        var nodes = panel.panelNode.querySelectorAll(".cssElementRuleContainer .cssRule");
        FBTest.ok(nodes.length > 0, "There must be some styles: " + nodes.length);

        callback();
    });
}
