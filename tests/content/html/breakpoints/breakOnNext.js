function runTest()
{
    FBTest.sysout("html.breakpoints; START");
    FBTest.setPref("filterSystemURLs", true);


    FBTest.openNewTab(basePath + "html/breakpoints/breakOnNext.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableAllPanels();

        var doNotFilter = FBTest.getPref("filterSystemURLs");

        FBTest.compare(true, doNotFilter, "Pref filterSystemURLs must be set true");
        FBTest.compare(true, FW.Firebug.filterSystemURLs, "Pref Firebug.filterSystemURLs must be set true");

        // A suite of asynchronous tests.
        var testSuite = [];
        testSuite.push(function(callback) {
            breakOnMutation(win, "breakOnAttrModified", 41, callback);
        });
        testSuite.push(function(callback) {
            breakOnMutation(win, "breakOnNodeInserted", 52, callback);
        });
        testSuite.push(function(callback) {
            breakOnMutation(win, "breakOnNodeRemoved", 58, callback);
        });
        testSuite.push(function(callback) {
            breakOnMutation(win, "breakOnTextModified", 47, callback);
        });

        // Realod window to activate debugger and run all tests.
        FBTest.reload(function(win) {
            FBTest.runTestSuite(testSuite, function() {
                FBTest.testDone("html.breakpoints; DONE");
            });
        })
    });
}

function breakOnMutation(win, buttonId, lineNo, callback)
{
    FBTest.selectPanel("html");

    var chrome = FW.Firebug.chrome;
    FBTest.clickBreakOnNextButton(chrome);

    FBTest.waitForBreakInDebugger(chrome, lineNo, false, function(sourceRow)
    {
        FBTest.sysout("html.breakpoints; "+ buttonId);
        FBTest.clickContinueButton(chrome),
        FBTest.progress("The continue button is pushed");
        callback();
    });

    FBTest.click(win.document.getElementById(buttonId));
    FBTest.sysout("html.breakpoints; " + buttonId + " button clicked");
}
