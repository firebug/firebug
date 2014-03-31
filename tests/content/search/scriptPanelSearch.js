// FBTest entry point
function runTest()
{
    FBTest.openNewTab(basePath + "search/scriptVictim.htm", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var panel = FBTest.selectPanel("script");

            // There is several configurations.
            var testSuite = [];

            // Test 1: 'Script', forward, no case sensitive, global (multiple files)
            testSuite.push(function(callback)
            {
                FBTest.selectPanelLocationByName(panel, "scriptVictim.htm");
                FBTest.waitForDisplayedText("script", "Search Test Page", function(row)
                {
                    executeSearchTest("script", false, false, true, 30, function(counter)
                    {
                        FBTest.progress("search; Case insensitive test finished", counter);

                        verifySearchResults({
                            "scriptVictim.htm": 18,
                            "htmlIframe.htm": 5,
                            "script1.js": 5,
                            "script2.js": 2
                        }, counter);

                        callback();
                    });
                });
            });

            // Test 2: 'Script', forward, case sensitive, global (multiple files).
            testSuite.push(function(callback)
            {
                FBTest.selectPanelLocationByName(panel, "scriptVictim.htm");
                executeSearchTest("Script", false, true, true, 4, function(counter)
                {
                    FBTest.progress("search; Case sensitive test finished", counter);

                    verifySearchResults({
                        "scriptVictim.htm": 1,
                        "htmlIframe.htm": undefined,
                        "script1.js": 3,
                        "script2.js": undefined,
                    }, counter);

                    callback();
                });
            });

            // Test 3: 'Script', forward, no case sensitive, not global.
            testSuite.push(function(callback)
            {
                FBTest.selectPanelLocationByName(panel, "scriptVictim.htm");
                executeSearchTest("script", false, false, false, 8, function(counter)
                {
                    FBTest.progress("search; Search within one file finished", counter);

                    verifySearchResults({
                        "scriptVictim.htm": 8,
                        "htmlIframe.htm": undefined,
                        "script1.js": undefined,
                        "script2.js": undefined,
                    }, counter);

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

// Set search box value and global search options.
function doSearch(text, reverse, caseSensitive, global, callback)
{
    FW.Firebug.chrome.$("fbSearchBox").value = text;

    FBTest.setPref("searchCaseSensitive", caseSensitive);
    FBTest.setPref("searchGlobal", global);

    // Press enter key within the search box.
    FBTest.focus(FW.Firebug.chrome.$("fbSearchBox"));
    FBTest.sendKey("RETURN", "fbSearchBox");
}

// Execute one test.
function executeSearchTest(text, reverse, caseSensitive, global, total, callback)
{
    // Add panel listener.
    var panel = FBTest.getPanel("script");
    var panelNode = panel.panelNode;

    var counter = {};
    var totalMatches = 0;

    var listener =
    {
        onLineHighlight: function(lineNum, lineText)
        {
            lineNum = lineNum + 1;

            var href = (panel.location ? (panel.location.url || panel.location.href) : undefined);

            var match = {
                href: href || "default",
                line: lineNum
            };

            FBTest.sysout("match found for '" + text +"': " + match.href +
                " (" + match.line + ") when panel.location ", panel.location);

            // If it isn't again the first match do next search (pressing enter key).
            // If we have reached the end of the last file and starting again, finish
            // the test.
            if (total > totalMatches)
            {
                var href = match.href.substr(match.href.lastIndexOf("/") + 1);
                counter[href] = (counter[href] || 0) + 1;

                totalMatches++;

                // Unhighlight manually, so we can immediatelly wait for the next
                // highlight line event.
                FBTest.unhighlightScriptPanelLine();

                // The timeout is here mainly to get rid off the current stack
                // and avoid UI freezing a bit.
                setTimeout(function()
                {
                    doSearch(text, reverse, caseSensitive, global, callback);
                }, 50);
            }
            else
            {
                DebuggerController.removeListener(browser, listener);
                callback(counter);
            }
        }
    };

    var browser = FBTest.getCurrentTabBrowser();
    DebuggerController.addListener(browser, listener);

    // Start search.
    doSearch(text, reverse, caseSensitive, global, callback);
}

// Verify search results.
function verifySearchResults(expected, actual)
{
    for (var file in expected)
    {
        FBTest.compare(expected[file], actual[file],
            "There must be " + expected[file] + " lines with 'Script' in " + file);
    }
}
