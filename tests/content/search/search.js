function executeSearch(text, reverse, caseSensitive, global) {

    FW.Firebug.chrome.$("fbSearchBox").value = text;
    FBTest.setPref("searchCaseSensitive", caseSensitive);
    FBTest.setPref("searchGlobal", global);

    if (!reverse) {
        FBTest.progress("pressKey 13@"+"fbSearchBox");
        FBTest.sendKey("RETURN", "fbSearchBox"); // FW.Firebug.chrome.$("fbSearchBox"),
    } else {
        FBTest.progress("fbSearchPrev");
        var prevButton = FW.Firebug.chrome.$("fbSearchPrev");
        FBTest.ok(prevButton, "We can locate the prev button");
        if (prevButton)
            FBTest.click(prevButton);
    }
}

function executeRangeSearch(text, reverse, caseSensitive, global, container, continuation) {
    executeSearch("");

    continuation = continuation || function() {};

    var panel = FirebugChrome.getSelectedPanel();
    var firstLocation = panel.location;

    setTimeout(function() {
        executeSearch(text, reverse, caseSensitive, global);
        setTimeout(
            function(){
                var sel = container.ownerDocument.defaultView.getSelection();
                if (!sel.rangeCount) {
                    return continuation({});
                }

                var count = {};
                var initialRange = sel.getRangeAt(0), hasOtherDoc = false;
                var lastRange = initialRange, curRange;
                var lastLocation = firstLocation;

                executeSearch(text, reverse, caseSensitive, global);
                setTimeout(searchIteration, 100);
                function searchIteration() {
                    FBTest.compare(sel.rangeCount, 1, "Single selection");
                    if (sel.rangeCount != 1) {
                        return continuation(count);
                    }
                    curRange = sel.getRangeAt(0);
                    var isInitialDoc = !firstLocation || firstLocation == panel.location;
                    hasOtherDoc = hasOtherDoc || !isInitialDoc;
                    var isInitialMatch =
                            (initialRange.compareBoundaryPoints(Range.START_TO_START, curRange)
                            || initialRange.compareBoundaryPoints(Range.END_TO_END, curRange)) == 0;
                    var isFirstMatch = isInitialDoc && (hasOtherDoc || isInitialMatch);

                    // Check the order of the range
                    if ((!lastLocation || lastLocation == panel.location)
                            && !isFirstMatch) {
                        FBTest.compare(
                                lastRange.compareBoundaryPoints(Range.START_TO_START, curRange),
                                reverse ? 1 : -1,
                                "Range order is correct.");
                    }

                    lastRange = curRange;
                    lastLocation = panel.location;

                    var href = (panel.location ? panel.location.href : undefined) || "default";
                    href = href.substr(href.lastIndexOf("/")+1);
                    count[href] = (count[href] || 0) + 1;

                    if (!isFirstMatch) {
                        executeSearch(text, reverse, caseSensitive, global);
                        setTimeout(searchIteration, 100);
                    } else {
                        return continuation(count);
                    }
                }
            }, 0);
        }, 0);
}

function executeLineSearch(text, reverse, caseSensitive, global, container, continuation) {
    executeSearch("");

    continuation = continuation || function() {};

    var panel = FW.Firebug.chrome.getSelectedPanel();

    var count = {};
    var lastMatch, firstMatch;

    function monitor(event) {
        var target = event.target;
        if (event.attrName == "class" && event.newValue.indexOf("jumpHighlight") > -1) {
            var lineNumEl = target.getElementsByClassName("sourceLine")[0];
            var lineNum = parseInt(lineNumEl.textContent.replace(/\s/g, ''));

            var line = {
                href: (panel.location ? panel.location.href : undefined) || "default",
                line: lineNum
            };

            var isFirstMatch = false;
            if (lastMatch) {
                isFirstMatch = firstMatch.href == line.href && firstMatch.line == line.line;

                if (!isFirstMatch && lastMatch.href == line.href) {
                    // Check the order of the range
                    FBTest.compare(
                            line.line < lastMatch.line,
                            reverse,
                            "Range order is correct: " + line.line + " " + lastMatch.line + " " + line.href);
                }
            }

            firstMatch = firstMatch || line;
            lastMatch = line;

            if (!isFirstMatch) {
                var href = line.href.substr(line.href.lastIndexOf("/")+1);
                count[href] = (count[href] || 0) + 1;

                setTimeout(function() {
                    executeSearch(text, reverse, caseSensitive, global);
                }, 100);
            } else {
                container.removeEventListener("DOMAttrModified", monitor, false);
                return continuation(count);
            }
        }
    }

    container.addEventListener("DOMAttrModified", monitor, false);
    executeSearch(text, reverse, caseSensitive, global);
}

function executeRangeTestSuite(tests, container, continuation) {
    executeSearchTestSuite(tests, container, continuation, executeRangeSearch);
}

function executeLineTestSuite(tests, container, continuation) {
    executeSearchTestSuite(tests, container, continuation, executeLineSearch);
}

function executeSearchTestSuite(tests, container, continuation, exec) {
    var testIter = 0 ;

    function execTest() {
        if (testIter >= tests.length) {
            if (continuation)   continuation();
            return;
        }

        var cur = tests[testIter];
        FBTest.progress(cur.description);

        exec(cur.text, cur.reverse,
                cur.caseSensitive, cur.global,
                cur.container || container,
                function(count) {
                    if (cur.expected instanceof Object) {
                        for (var i in cur.expected) {
                            FBTest.compare(cur.expected[i], count[i], cur.description + ": " + i);
                            delete count[i];
                        }
                        for (var i in count) {
                            FBTest.compare(0, count[i], cur.description + ": unexpected " + i);
                            delete count[i];
                        }
                    } else {
                        var hasMatch = false;
                        for (var i in count) {
                            FBTest.compare(!hasMatch ? cur.expected : 0, count[i], cur.description + ": zero " + i);
                            hasMatch = true;
                        }
                    }
                    testIter++;
                    execTest();
                });
    };

    execTest();
}

function openAndSelectPanel(panelName) {

    if (FW.Firebug.currentContext.detached)
        FW.Firebug.chrome.focus();
    else
        FW.Firebug.showBar(true);

    return FW.Firebug.chrome.selectPanel(panelName);
}

function selectLocation(panel, re) {

    var locs = panel.getLocationList();
    for (var i = 0; i < locs.length; i++) {
        var loc = locs[i];
        if (re.exec(loc.href)) {
            panel.navigate(loc);
            break;
        }
    }
}

function makeRequest(method, url, callback)
{
    var request = new XMLHttpRequest();
    request.onreadystatechange = function () {
        if (request.readyState == 4 && request.status == 200)
            setTimeout(function() {
                callback(request);
            }, layoutTimeout);
    };

    request.open(method, url, true);
    request.send(null);
}
