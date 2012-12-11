function runTest()
{
    var prevValue = FBTrace.DBG_TESTCASE;
    FBTrace.DBG_TESTCASE = true;

    var prevErrors = FBTrace.DBG_ERRORS;
    FBTrace.DBG_ERRORS = true;

    var prevSysout = FBTest.sysout;
    FBTest.sysout = function(msg)
    {
        FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window, true, "progress: "+msg));
        FBTest.resetTimeout();
    }

    var prevTrace = FBTrace.sysout;
    FBTrace.sysout = function(msg)
    {
        FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window, true, "progress: "+msg));
    }

    FBTest.sysout("cookiesPanel.START");

    FBTest.openNewTab(basePath + "cookies/general/cookiesPanel.html", function(win)
    {
        FBTest.openFirebug();
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            FBTest.sysout("cookiesPanel; Check existence of the Cookies panel.");
            FBTest.progress("cookiesPanel; is Firebug open: " + FBTest.isFirebugOpen());
            FBTest.progress("cookiesPanel; is Firebug active: " + FBTest.isFirebugActive());
            FBTest.progress("Current context " + FW.Firebug.currentContext);
            FBTest.progress("Cookies panel " + FBTest.getPanel("cookies"));

            // Make sure the Cookie panel's UI is there.
            var panel = FBTest.selectPanel("cookies");
            if (panel)
                FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");

            FBTrace.DBG_TESTCASE = prevValue;
            FBTrace.DBG_ERRORS = prevErrors;

            FBTest.sysout = prevSysout;
            FBTrace.sysout = prevTrace;

            // Finish test
            FBTest.testDone("cookiesPanel.DONE");
        });
    });
};
