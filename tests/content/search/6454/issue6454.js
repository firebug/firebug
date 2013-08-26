function runTest()
{
    FBTest.sysout("issue6454.START");

    FBTest.openNewTab(basePath + "search/6454/issue6454.html", function()
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        var testSuite = [];

        // Test 1: 'testing', forward, case insensitive
        testSuite.push(function(callback)
        {
            executeSearchTest("testing", false, false, function(counter)
            {
                FBTest.compare(10, counter, "There must be precise number " +
                     "of occurences (10) actual: " + counter);
                callback();
            });
        });

        // Test 2: 'testing', forward, case sensitive
        testSuite.push(function(callback)
        {
            executeSearchTest("testing", false, true, function(counter)
            {
                FBTest.compare(4, counter, "There must be precise number " +
                    "of occurences (4) actual: " + counter);
                callback();
            });
        });

        // Test 3: 'Testing', forward, case insensitive.
        testSuite.push(function(callback)
        {
            executeSearchTest("Testing", false, false, function(counter)
            {
                FBTest.compare(5, counter, "There must be precise number " +
                    "of occurences (5) actual: " + counter);
                callback();
            });
        });

        FBTest.runTestSuite(testSuite, function()
        {
            FBTest.testDone("issue6454.DONE");
        });
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
