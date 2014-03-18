const BP_BREAKONATTRCHANGE = 1;
const BP_BREAKONCHILDCHANGE = 2;
const BP_BREAKONREMOVE = 3;

function runTest()
{
    FBTest.setPref("filterSystemURLs", false);

    var doNotFilter = FBTest.getPref("filterSystemURLs");

    FBTest.compare(false, doNotFilter, "Pref filterSystemURLs must not be set true");
    FBTest.compare(false, FW.Firebug.filterSystemURLs, "Pref Firebug.filterSystemURLs must not be set true");


    FBTest.openNewTab(basePath + "html/breakpoints/breakOnElement.html", function(win)
    {
        var filter = FBTest.getPref("filterSystemURLs");
        FBTest.compare(false, filter, "Pref filterSystemURLs must not be set true");
        FBTest.compare(false, FW.Firebug.filterSystemURLs, "Pref Firebug.filterSystemURLs must not be set true");

        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                // A suite of asynchronous tests.
                var testSuite = [];
                testSuite.push(function(callback)
                {
                    breakOnMutation(win, BP_BREAKONATTRCHANGE, "breakOnAttrModified", 45, callback);
                });
                testSuite.push(function(callback)
                {
                    breakOnMutation(win, BP_BREAKONCHILDCHANGE, "breakOnChildInserted", 50, callback);
                });
                testSuite.push(function(callback)
                {
                    breakOnMutation(win, BP_BREAKONCHILDCHANGE, "breakOnChildRemoved", 55, callback);
                });
                testSuite.push(function(callback)
                {
                    breakOnMutation(win, BP_BREAKONREMOVE, "breakOnNodeRemoved", 60, callback);
                });

                FBTest.runTestSuite(testSuite, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function breakOnMutation(win, type, buttonId, lineNo, callback)
{
    var chrome = FW.Firebug.chrome;
    var content = win.document.getElementById("content");
    var context = chrome.window.Firebug.currentContext;

    FBTest.selectPanel("html");

    // Set breakpoint.
    FW.Firebug.HTMLModule.MutationBreakpoints.onModifyBreakpoint(context,
        content, type);

    FBTest.waitForBreakInDebugger(chrome, lineNo, false, function(sourceRow)
    {
        FBTest.sysout("html.breakpoints.CB; " + buttonId);
        FBTest.clickContinueButton(chrome);
        FBTest.progress("The continue button is pushed");

        // Remove breakpoint.
        FW.Firebug.HTMLModule.MutationBreakpoints.onModifyBreakpoint(context,
            content, type);

        callback();
    });

    FBTest.click(win.document.getElementById(buttonId));
    FBTest.sysout("html.breakpoints.CB; " + buttonId + " button clicked");
}
