// Custom timeout for this test.
window.FBTestTimeout = 25000;

// FBTest entry point
function runTest()
{
    FBTest.sysout("search; START");
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
                executeSearchTest("script", false, false, true, function(counter)
                {
                    FBTest.sysout("search; Case insensitive test finished", counter);

                    verifySearchResults({
                        "scriptVictim.htm": 8,
                        "htmlIframe.htm": 3,
                        "script1.js": 5,
                        "script2.js": 1
                    }, counter);

                    callback();
                });
            });

            // Test 2: 'Script', forward, case sensitive, global (multiple files).
            testSuite.push(function(callback)
            {
                FBTest.selectPanelLocationByName(panel, "scriptVictim.htm");
                executeSearchTest("Script", false, true, true, function(counter)
                {
                    FBTest.sysout("search; Case sensitive test finished", counter);

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
                executeSearchTest("script", false, false, false, function(counter)
                {
                    FBTest.sysout("search; Search within one file finished", counter);

                    verifySearchResults({
                        "scriptVictim.htm": 8,
                        "htmlIframe.htm": undefined,
                        "script1.js": undefined,
                        "script2.js": undefined,
                    }, counter);

                    callback();
                });
            });

            FBTest.runTestSuite(testSuite, function() {
                FBTest.testDone("search; DONE");
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
function executeSearchTest(text, reverse, caseSensitive, global, callback)
{
    // Add panel listener.
    var panel = FBTest.getPanel("script");
    var panelNode = panel.panelNode;
    panelNode.addEventListener("DOMAttrModified", onFound, false);

    var counter = {};
    var prevMatch, firstMatch;

    // If a match is found a "jumpHighlight" style is used to highlight the source
    // line. Use DOMAttrModified event to track this.
    function onFound(event)
    {
        var target = event.target;
        if (event.attrName == "class" && event.newValue.indexOf("jumpHighlight") > -1)
        {
            var lineNumEl = target.getElementsByClassName("sourceLine")[0];
            var lineNum = parseInt(lineNumEl.textContent.replace(/\s/g, ''));

            var href = (panel.location ? (panel.location.url || panel.location.href) : undefined);

            var match = {
                href: href || "default",
                line: lineNum
            };

            FBTest.sysout("match found for '" + text +"': " + match.href +
                " (" + match.line + ") when panel.location ", panel.location);

            var isFirstMatch = false;

            // If we have found a next match make verification.
            if (prevMatch)
            {
                isFirstMatch = firstMatch.href == match.href && firstMatch.line == match.line;
                if (!isFirstMatch && prevMatch.href == match.href)
                {
                    if ((match.line < prevMatch.line) != reverse)
                    {
                        FBTest.sysout("search; line order is not correct " + isFirstMatch,
                            [match, prevMatch, firstMatch]);

                        FBTest.ok(false, "Line order is NOT correct: " + match.line + " " +
                            prevMatch.line + " " + match.href);
                    }
                }
            }

            // Remember the very first an the previous match.
            firstMatch = firstMatch || match;
            prevMatch = match;

            // If it isn't again the first match do next search (pressing enter key).
            // If we have reached the end of the last file and starting again, finish
            // the test.
            if (!isFirstMatch)
            {
                var href = match.href.substr(match.href.lastIndexOf("/") + 1);
                counter[href] = (counter[href] || 0) + 1;

                setTimeout(function(){
                    doSearch(text, reverse, caseSensitive, global, callback);
                }, 400);
            }
            else
            {
                panelNode.removeEventListener("DOMAttrModified", onFound, false);
                callback(counter);
            }
        }
    }

    panelNode.addEventListener("DOMAttrModified", onFound, false);

    // Start search.
    doSearch(text, reverse, caseSensitive, global, callback);
}

// Verify search results.
function verifySearchResults(expected, actual)
{
    for (var file in expected)
        FBTest.compare(expected[file], actual[file],
            "There must be " + expected[file] + " lines with 'Script' in " + file);
}
