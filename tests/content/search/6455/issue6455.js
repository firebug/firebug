function runTest()
{
    FBTest.sysout("issue6455.START");

    FBTest.openNewTab(basePath + "search/6455/issue6455.php", function()
    {
        FBTest.openFirebug();
        FBTest.selectPanel("cookies");

        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var testSuite = new FBTest.TaskList();

            testSuite.push(doSearch, "testing", 3, false);
            testSuite.push(doSearch, "Testing", 1, true);
            testSuite.push(doSearch, "TESTING", 1, true);
            testSuite.push(doSearch, "xxx", 1, false);

            testSuite.run(function()
            {
                FBTest.testDone("issue6455.DONE");
            });
        });
    });
}

function doSearch(callback, text, expected, caseSensitive)
{
    FBTest.setPref("searchCaseSensitive", caseSensitive);

    FBTest.setSearchFieldText(text, function()
    {
        var panelNode = FBTest.getPanel("cookies").panelNode;
        var rows = panelNode.querySelectorAll(".cookieRow.matched");

        FBTest.compare(expected, rows.length,
            "There must be expected number of cookies " + rows.length);

        callback();
    });
}
