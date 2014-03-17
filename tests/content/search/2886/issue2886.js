function runTest()
{
    FBTest.openNewTab(basePath + "search/2886/issue2886.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function(win)
            {
                var tests = new FBTest.TaskList();
                tests.push(doSearch, "(!(accidental-regexp))", 8, false);
                tests.push(doSearch, "keyword\\s+\\d+", 10, true);

                tests.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function doSearch(callback, searchString, lineNo, useRegExp)
{
    FBTest.progress("Search for " + searchString);
    FBTest.setPref("searchUseRegularExpression", useRegExp);

    // Execute search.
    FBTest.searchInScriptPanel(searchString, function(line)
    {
        FBTest.compare(lineNo, line, searchString + " found on line: " +
            line + ", expected: " + lineNo);

        callback();
    });
}
