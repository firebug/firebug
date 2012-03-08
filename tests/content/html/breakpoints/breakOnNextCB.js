function runTest()
{
    FBTest.sysout("html.breakpoints.CB; START");
    FBTest.setPref("filterSystemURLs", false);


    FBTest.openNewTab(basePath + "html/breakpoints/breakOnNext.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableAllPanels();

        var filter = FBTest.getPref("filterSystemURLs");
        FBTest.compare(false, filter, "Pref filterSystemURLs must not be set true");
        FBTest.compare(false, FW.Firebug.filterSystemURLs, "Pref Firebug.filterSystemURLs must not be set true");

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

        // Reload window to activate debugger and run all tests.
        FBTest.reload(function(win) {
            FBTest.runTestSuite(testSuite, function() {
                FBTest.testDone("html.breakpoints.CB; DONE");
            });
        })
    });
}

function breakOnMutation(win, buttonId, lineNo, callback)
{
    FBTest.selectPanel("html");

    var filter = FBTest.getPref("filterSystemURLs");

    FBTest.compare(false, filter, "Pref filterSystemURLs must not be set true");
    FBTest.compare(false, FW.Firebug.filterSystemURLs, "Pref Firebug.filterSystemURLs must not be set true");

    var chrome = FW.Firebug.chrome;
    FBTest.clickBreakOnNextButton(chrome);

    FBTest.waitForBreakInDebugger(chrome, lineNo, false, function(sourceRow)
    {
        FBTest.sysout("html.breakpoints.CB; "+ buttonId);
        FBTest.clickContinueButton(chrome),
        FBTest.progress("The continue button is pushed");
        callback();
    });

    FBTest.click(win.document.getElementById(buttonId));
    FBTest.sysout("html.breakpoints.CB; " + buttonId + " button clicked");
}
