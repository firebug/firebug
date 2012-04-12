function runTest()
{
    FBTest.sysout("dom.breakpoints; START");
    FBTest.setPref("filterSystemURLs", true);

    FBTest.openNewTab(basePath + "dom/breakpoints/breakOnProperty.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableAllPanels();

        FBTest.selectPanel("dom");

        // Reload window to activate debugger and run breakOnTest.
        FBTest.reload(function(win)
        {
            var panel = FBTest.getPanel("dom");
            FBTest.waitForDOMProperty("anObject", function(row)
            {
                // Wait till _testProperty row in the UI is available. This row displays
                // the _testProperty and we need to created a breakpoint on it.
                FBTest.waitForDOMProperty("_testProperty", function(row)
                {
                    // Set breakpoint.
                    panel.breakOnProperty(row);

                    var doc = row.ownerDocument;
                    var testSuite = [];
                    testSuite.push(function(callback) {
                        FBTest.progress("4 " + win);
                        breakOnMutation(win, "changeProperty", 43, callback);
                    });
                    testSuite.push(function(callback) {
                        FBTest.click(win.document.getElementById("removeProperty"));
                        callback();
                    });
                    testSuite.push(function(callback) {
                        breakOnMutation(win, "addProperty", 38, callback);
                    });
                    testSuite.push(function(callback) {
                        breakOnMutation(win, "changeProperty", 43, callback);
                    });

                    FBTest.runTestSuite(testSuite, function() {
                        FBTest.testDone("dom.breakpoints; DONE");
                    });
                });

                // Click to expand object's properties.
                var label = row.getElementsByClassName("memberLabel").item(0);
                FBTest.click(label);
            }, true);
        });
    });
}

function breakOnMutation(win, buttonId, lineNo, callback)
{
    FBTest.progress("breakOnMutation; " + buttonId);

    FBTest.selectPanel("dom");

    var chrome = FW.Firebug.chrome;
    FBTest.waitForBreakInDebugger(chrome, lineNo, false, function(sourceRow)
    {
        FBTest.clickContinueButton(chrome);
        FBTest.progress("The continue button is pushed");
        callback();
    });

    FBTest.click(win.document.getElementById(buttonId));
}
