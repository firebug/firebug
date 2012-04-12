function runTest()
{
    FBTest.sysout("issue2886.START");

    FBTest.openNewTab(basePath + "search/2886/issue2886.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("script");

        FBTest.enableScriptPanel(function(win)
        {
            var tests = new FBTest.TaskList();
            tests.push(doSearch, "(!(accidental-regexp))", 8, false);
            tests.push(doSearch, "keyword\\s+\\d+", 10, true);

            tests.run(function()
            {
                FBTest.testDone("issue2886.DONE");
            });
        });
    });
}

function doSearch(callback, searchString, lineNo, useRegExp)
{
    FBTest.progress("Search for " + searchString);
    FBTest.setPref("searchUseRegularExpression", useRegExp);

    // Execute search.
    FBTest.searchInScriptPanel(searchString, function(row)
    {
        var sourceLine = row.querySelector(".sourceLine");
        var actualLineNo = parseInt(sourceLine.textContent);
        FBTest.compare(lineNo, actualLineNo,
            searchString + " found on line: " + actualLineNo + ", expected: " + lineNo);

        callback();
    });
}
