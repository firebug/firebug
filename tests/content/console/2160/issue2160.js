function runTest()
{
    FBTest.sysout("issue2160.START");

    FBTest.openNewTab(basePath + "console/2160/issue2160.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function()
        {
            FBTest.selectPanel("console");

            var tests = [];
            tests.push(test1);
            tests.push(test2);

            FBTest.runTestSuite(tests, function() {
                FBTest.testDone("issue2160.DONE");
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
    FBTest.reload();

    // Wait for the last log.
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "Text", null, "Doing addOnLoad...");
    recognizer.onRecognizeAsync(callback);
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
