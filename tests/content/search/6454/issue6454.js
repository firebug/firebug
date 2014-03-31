function runTest()
{
    FBTest.openNewTab(basePath + "search/6454/issue6454.html", function()
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");

            var tasks = new FBTest.TaskList();
            tasks.push(searchTest, "testing", false, 14);
            tasks.push(searchTest, "testing", true, 7);
            tasks.push(searchTest, "Testing", false, 8);
            tasks.push(searchTest, "#test div", false, 5);
            tasks.push(searchTest, "/html/body", true, 4);
            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function searchTest(callback, text, caseSensitive, expectedMatches)
{
    executeSearchTest(text, false, caseSensitive, function(counter)
    {
        FBTest.compare(expectedMatches, counter, "There must be " + expectedMatches +
            " matches when searching for \"" + text + "\"");
        callback();
    });
}

// xxxHonza: could be shared FBTest API
// Execute one test.
function executeSearchTest(text, reverse, caseSensitive, callback)
{
    var counter = 0;
    var firstMatch = null;

    function searchNext()
    {
        var panel = FBTest.getPanel("html");
        var sel = panel.document.defaultView.getSelection();
        if (sel.rangeCount != 1)
        {
            FBTest.compare(1, sel.rangeCount, "There must be one range selected.");
            return callback(counter);
        }

        var match = sel.getRangeAt(0);

        // OK, we have found the first occurence again, so finish the test.
        FBTest.sysout("search.match; ", match);
        if (firstMatch && (firstMatch.compareBoundaryPoints(Range.START_TO_START, match) ||
            firstMatch.compareBoundaryPoints(Range.END_TO_END, match)) == 0)
            return callback(counter);

        // Remember the first match.
        if (!firstMatch)
        {
            firstMatch = match;
            FBTest.sysout("search.firstMatch; ", firstMatch);
        }

        counter++;

        doSearch(text, reverse, caseSensitive, callback);
        setTimeout(searchNext, 300);
    };

    doSearch(text, reverse, caseSensitive, callback);
    setTimeout(searchNext, 300);
}

// Set search box value and global search options.
function doSearch(text, reverse, caseSensitive, callback)
{
    FW.Firebug.chrome.$("fbSearchBox").value = text;
    FBTest.setPref("searchCaseSensitive", caseSensitive);

    // Press enter key within the search box.
    FBTest.focus(FW.Firebug.chrome.$("fbSearchBox"));
    FBTest.sendKey("RETURN", "fbSearchBox");
}
