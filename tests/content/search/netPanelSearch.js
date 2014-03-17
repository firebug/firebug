// FBTest entry point
function runTest()
{
    FBTest.clearCache();
    FBTest.openNewTab(basePath + "search/netVictim.htm", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.selectPanel("net");

            // There is several configurations.
            var testSuite = [];

            // Test 1: 'script', forward, case insensitive, include response bodies.
            testSuite.push(function(callback)
            {
                executeSearchTest("script", false, false, true, function(counter)
                {
                    FBTest.compare(13, counter, "There must be exactly 13 occurrences of the " +
                        "word 'script' including the response bodies; actual: " + counter);
                    callback();
                });
            });

            // Test 2: 'script', forward, case sensitive, include response bodies.
            testSuite.push(function(callback)
            {
                executeSearchTest("Script", false, true, true, function(counter)
                {
                    FBTest.compare(2, counter, "There must be exactly 2 occurrences of the " +
                        "(case-sensitive) word 'Script' including the response bodies; actual: " +
                        counter);
                    callback();
                });
            });

            // Test 3: 'script', forward, case insensitive, not response bodies.
            testSuite.push(function(callback)
            {
                executeSearchTest("script", false, false, false, function(counter)
                {
                    FBTest.compare(1, counter, "There must exactly 1 occurrence of the word " +
                        "'script'; actual: " + counter);
                    callback();
                });
            });

            FBTest.runTestSuite(testSuite, function() {
                FBTest.testDone();
            });
        });
    });
}

// Set search box value and global search options.
function doSearch(text, reverse, caseSensitive, responseBody, callback)
{
    FW.Firebug.chrome.$("fbSearchBox").value = text;
    FBTest.setPref("searchCaseSensitive", caseSensitive);
    FBTest.setPref("netSearchResponseBody", responseBody);

    // Press enter key within the search box.
    FBTest.focus(FW.Firebug.chrome.$("fbSearchBox"));
    FBTest.sendKey("RETURN", "fbSearchBox");
}

// Execute one test.
function executeSearchTest(text, reverse, caseSensitive, responseBody, callback)
{
    var counter = 0;
    var firstMatch = null;

    function searchNext()
    {
        var panel = FBTest.getPanel("net");
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

        doSearch(text, reverse, caseSensitive, responseBody, callback);
        setTimeout(searchNext, 300);
    };

    doSearch(text, reverse, caseSensitive, responseBody, callback);
    setTimeout(searchNext, 300);
}
