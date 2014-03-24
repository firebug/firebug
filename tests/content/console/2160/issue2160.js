function runTest()
{
    FBTest.openNewTab(basePath + "console/2160/issue2160.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                var tests = [];
                tests.push(test1);
                tests.push(test2);

                FBTest.runTestSuite(tests, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

// ************************************************************************************************

function test1(callback)
{
    scrollToTop();

    // Must be still at the top after reload.
    reload(function()
    {
        FBTest.ok(isScrolledToTop(), "The Console content must be scrolled to the top");
        callback();
    });
}

function test2(callback)
{
    scrollToBottom();

    // Must be still at the bottom after reload.
    reload(function()
    {
        var panel = FBTest.getPanel("console");
        FBTest.progress("top: " + panel.scrollTop + ", offset: " + panel.offsetHeight +
            ", height: " + panel.scrollHeight);
        FBTest.ok(isScrolledToBottom(), "The Console content must be scrolled to the bottom");
        callback();
    });
}

function reload(callback)
{
    FBTest.reload(() =>
    {
        FBTest.waitForDisplayedText("console", "Doing addOnLoad...", callback);
    });
}

// ************************************************************************************************

function isScrolledToBottom()
{
    var panel = FBTest.getPanel("console");
    return FW.FBL.isScrolledToBottom(panel.panelNode);
}

function isScrolledToTop()
{
    var panel = FBTest.getPanel("console");
    return (panel.panelNode.scrollTop == 0);
}

function scrollToBottom()
{
    var panel = FBTest.getPanel("console");
    return FW.FBL.scrollToBottom(panel.panelNode);
}

function scrollToTop()
{
    var panel = FBTest.getPanel("console");
    return panel.panelNode.scrollTop = 0;
}
