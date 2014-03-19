function runTest()
{
    FBTest.setPref("showDOMProps", false);

    FBTest.openNewTab(basePath + "search/6435/issue6435.html", function()
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("dom");

            // There is several configurations.
            var testSuite = [];

            // Test 1: 'test', forward, case insensitive
            testSuite.push(function(callback)
            {
                executeSearchTest("test", false, false, function(counter)
                {
                    FBTest.compare(4, counter, "There must be precise number " +
                         "of occurences (4) actual: " + counter);
                    callback();
                });
            });

            // Test 2: 'test', forward, case sensitive
            testSuite.push(function(callback)
            {
                executeSearchTest("test", false, true, function(counter)
                {
                    FBTest.compare(2, counter, "There must be precise number " +
                        "of occurences (2) actual: " + counter);
                    callback();
                });
            });

            // Test 3: '21', forward, case insensitive.
            testSuite.push(function(callback)
            {
                executeSearchTest("21", false, false, function(counter)
                {
                    FBTest.compare(2, counter, "There must be precise number " +
                        "of occurences (2) actual: " + counter);
                    callback();
                });
            });

            FBTest.runTestSuite(testSuite, function()
            {
                FBTest.testDone();
            });
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
        var panel = FBTest.getPanel("dom");
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
