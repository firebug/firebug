function runTest()
{
    FBTest.openNewTab(basePath + "search/6453/issue6453.html", function()
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanelAndReload(function(win)
            {
                var testSuite = new FBTest.TaskList();

                testSuite.push(doSearch, "testing", 6, false);
                testSuite.push(doSearch, "Testing", 2, true);
                testSuite.push(doSearch, "TESTING", 1, true);
                testSuite.push(doSearch, "xxx", 1, false);

                testSuite.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function doSearch(callback, text, expected, caseSensitive)
{
    FBTest.setPref("searchCaseSensitive", caseSensitive);

    FBTest.setSearchFieldText(text, function()
    {
        var panelNode = FBTest.getPanel("console").panelNode;
        var rows = panelNode.querySelectorAll(".logRow.matched");

        FBTest.compare(expected, rows.length,
            "There must be expected number of logs " + rows.length);

        callback();
    });
}
