/* See license.txt for terms of usage */

/**
 * This file defines Core APIs for test drivers. The FBTest object is injected
 * into this scope by the Firebug test harness.
 */

(function() {

// ********************************************************************************************* //
// Constants

// XPCOM
var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu["import"]("resource://fbtest/EventUtils.js");

// Backward compatibility
FBTest.Firebug = FBTest;
FBTestFirebug = FBTest;

// ********************************************************************************************* //
// Error Handling

/** @ignore */
window.onerror = function(errType, errURL, errLineNum)
{
    var path = window.location.pathname;
    var fileName = path.substr(path.lastIndexOf("/") + 1);
    var errorDesc = errType + " (" + errLineNum + ")" + " " + errURL;
    FBTest.sysout(fileName + " ERROR " + errorDesc);
    FBTest.ok(false, fileName + " ERROR " + errorDesc);
    FBTestFirebug.testDone();
    return false;
};

// ********************************************************************************************* //
// Test Driver Core API (direct access to FBTestApp)

/**
 * Verification method, prints result of a test. If the first "pass" parameter is "true"
 * the test passes, otherwise fails.
 *
 * @param {Boolean} pass Result of a test.
 * @param {String} msg A message to be displayed as a test results under the current test
 *      within the test console.
 */
this.ok = function(pass, msg)
{
    if (!pass)
        FBTest.sysout("FBTest **** FAILS **** " + msg);
    else
        FBTest.sysout("FBTest ok " + msg);

    FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window, pass, msg));

    if (!pass)
        this.onFailure(msg);
    else
        FBTest.resetTimeout();

    return pass;
};

/**
 * Verification method. Compares expected and actual string (typically from the Firebug UI).
 * If "actual" and "expected" parameters are equal, the test passes, otherwise it fails.
 *
 * @param {String} expected Expected value
 * @param {String} actual Actual value
 * @param {String} msg A message to be displayed as a test result under the current test
 *      within the test console.
 * @param {String} shouldNotMatch Specifies whether expected and actual should not match
 */
this.compare = function(expected, actual, msg, shouldNotMatch)
{
    var result;
    if (expected instanceof RegExp)
    {
        result = actual ? actual.match(expected) : null;
        expected = expected ? expected.toString() : null;
    }
    else
    {
        // xxxHonza: TODO: lib/textSearch doesn't like '==='
        result = (expected == actual);
    }

    if (shouldNotMatch)
        result = !result;

    FBTest.sysout("compare "+(result?"passes":"**** FAILS ****")+" "+msg,
        {expected: expected, actual: actual});

    var shownMsg = msg;
    if (!result)
    {
        shownMsg += " (was: " + actual + ", expected" +
            (shouldNotMatch ? " otherwise" : ": " + expected) +
            (typeof actual === typeof expected ? ")" : " - different types)");
    }

    FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window,
        result, shownMsg, expected, actual));

    if (result)
        FBTest.resetTimeout();
    else
        FBTest.onFailure(msg);

    return result;
};

/**
 * Logs an exception under the current test within the test console.
 *
 * @param {String} msg A message to be displayed under the current test within the test console.
 * @param {Exception} err An exception object.
 */
this.exception = function(msg, err)
{
    FBTestApp.TestRunner.appendResult(new FBTestApp.TestException(window, msg, err));
};

/**
 * Prints a message into test results (displayed under a test within test console).
 *  
 * @param {String} msg A message to be displayed under the current test within the test console.
 */
this.progress = function(msg)
{
    FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window, true, "progress: "+msg));
    FBTestApp.TestSummary.setMessage(msg);
    FBTest.sysout("FBTest progress: ------------- "+msg+" -------------");
    FBTest.resetTimeout();
};

/**
 * Executed by the framework at the beginning of each test.
 */
this.testStart = function(test)
{
    FBTest.sysout("FBTestFirebug.testStart; " + test.path + " - " + test.desc, test);
};

/**
 * Finishes current test and prints also an info message to the status bar. The method
 * performs clean up (closes all browser tabs opened as part of the test,
 * removes all breakpoints, etc.)
 *
 * The method is asynchronous and the test that executed it should not perform
 * any further actions.
 *
 * @param {String} [message] A custom message for tracing. If not provided default
 * message will be generated automatically.
 */
this.testDone = function(message)
{
    FBTest.sysout("FBTestFirebug.testDone; Cleaning...");

    // Clean up now so, annotations are cleared and Firebug is not activated for the
    // next activated tab that would coincidentally come from the same domain. 
    FBTest.setToKnownState(() =>
    {
        var test = FBTestApp.TestRunner.currentTest;

        // Make sure the current stack is gone.
        setTimeout(() =>
        {
            FBTest.closeFirebug();
            FBTest.cleanUpTestTabs();

            if (!message)
            {
                // Compose default message for the tracing
                var path = test.path;
                var index = path.lastIndexOf("/");
                message = path.substr(index + 1) + " DONE";
            }

            FBTest.progress(message);

            FBTest.sysout("FBTestFirebug.testDone; DONE");

            FBTestApp.TestRunner.testDone(false, test);
        });
    });
};

/**
 * Returns URL of a directory with test cases (HTML pages with a manual test implementation)
 */
this.getHTTPURLBase = function()
{
    // xxxHonza: should be set as a global in this scope.
    return FBTestApp.TestConsole.getHTTPURLBase();
};

/**
 * Returns URL of a directory with test driver files.
 */
this.getLocalURLBase = function()
{
    // xxxHonza: should be set as a global in this scope.
    if (/file:/.test(FBTestApp.TestRunner.currentTest.driverBaseURI))
        return FBTestApp.TestRunner.currentTest.driverBaseURI;

    return FBTestApp.TestConsole.chromeToUrl(FBTestApp.TestRunner.currentTest.driverBaseURI, true);
};

/**
 * Basic logging into the Firebug tracing console. All logs made through this function
 * appears only if 'TESTCASE' options is set.
 *
 * @param {String} text A message to log.
 * @param {Object} obj An object to log.
 */
this.sysout = function(text, obj)
{
    if (FBTrace.DBG_TESTCASE)
        FBTrace.sysout(text, obj);
};

/**
 * In some cases the test can take longer time to execute than it's expected (e.g. due to a slow
 * test server connection).
 *
 * Instead of changing the default timeout to another (bigger) - but still fixed value, the test
 * can regularly reset the timeout.
 *
 * This way the runner knows that the test is not frozen and is still doing something.
 */
this.resetTimeout = function()
{
    FBTestApp.TestRunner.setTestTimeout(window);
};

// ********************************************************************************************* //
// APIs used by test harness (direct access to FBTestApp)

/**
 * Called by the test harness framework in case of a failing test. If *Fail Halt* option
 * is set and *Chromebug* extension installed, the debugger will halt the test execution.
 *
 * @param {String} msg A message to be displayed under the current test within the test console.
 */
this.onFailure = function(msg)
{
    FBTestApp.TestConsole.notifyObservers(this, "fbtest", "onFailure");
};

/**
 * This function is automatically called before every test sequence.
 */
this.setToKnownState = function(callback)
{
    FBTest.sysout("FBTestFirebug setToKnownState");

    // xxxHonza: TODO
    // 1) cookies permissions are not reset
    // 2) Net panel filter is not reset (the preference is, but the UI isn't)

    var Firebug = FBTest.FirebugWindow.Firebug;

    // Console preview is hidden by default
    if (this.isConsolePreviewVisible())
        this.clickConsolePreviewButton();

    // Use default Firebug height and side panel width
    this.setBrowserWindowSize(1024, 768);
    this.setFirebugBarHeight(270);
    this.setSidePanelWidth(350);

    this.clearSearchField();

    this.clearCache();

    // First clear all breakpoints and then perform deactivation.
    this.removeAllBreakpoints(function()
    {
        // These should be done with button presses not API calls.
        Firebug.PanelActivation.toggleAll("off");
        Firebug.PanelActivation.toggleAll("none");
        Firebug.PanelActivation.clearAnnotations(true);

        if (Firebug.isDetached())
            Firebug.toggleDetachBar();

        // Reset all options that also clears the breakpoints storage.
        Firebug.resetAllOptions(false);

        callback();
    });

    // xxxHonza: xxxJJB how clear the persisted panel state?
};

// ********************************************************************************************* //
// Module Loader

this.getRequire = function()
{
    if (typeof FW.require !== "undefined")
        return FW.require;

    var fbMainFrame = FW.document.getElementById("fbMainFrame");
    return fbMainFrame.contentWindow.require;
};

// ********************************************************************************************* //
// Task List (replaces the single runTestSuite method.

this.TaskList = function()
{
    this.tasks = [];
};

this.TaskList.prototype =
{
    push: function()
    {
        var args = FW.FBL.cloneArray(arguments);
        args = FW.FBL.arrayInsert(args, 1, [window]);
        this.tasks.push(FW.FBL.bind.apply(this, args));
    },

    /**
     * Wrap a function that does not take a callback parameter and push it to the list.
     */
    wrapAndPush: function(func)
    {
        var args = Array.prototype.slice.call(arguments, 1);
        this.push(function(callback)
        {
            func.apply(FBTest, args);
            callback();
        });
    },

    run: function(callback, delay)
    {
        FBTest.runTestSuite(this.tasks, callback, delay);
    }
};

/**
 * Support for set of asynchronous actions within a FBTest.
 *
 * Example:
 * ~~
 *  // A suite of asynchronous tests.
 *  var testSuite = [];
 *  testSuite.push(function(callback) {
 *      // TODO: test implementation
 *      // Continue with other tests.
 *      callback();
 *  });
 *  testSuite.push(function(callback) {
 *      // TODO: test implementation
 *      // Continue with other tests.
 *      callback();
 *  });
 *  // Run entire suite.
 *  runTestSuite(testSuite, function() {
 *      FBTestFirebug.testDone("DONE");
 *  });
 * ~~
 * @param {Array} tests List of asynchronous functions to be executed in order.
 * @param {Function} callback A callback that is executed as soon
 *                   as all functions in the list are finished.
 * @param {Number} delay A delay between tasks [ms]
 */
this.runTestSuite = function(tests, callback, delay)
{
    delay = delay || 200;

    setTimeout(function()
    {
        var test = tests.shift();
        if (!test)
        {
            callback();
            return;
        }

        function runNext()
        {
            FBTestFirebug.runTestSuite(tests, callback, delay);
        }

        try
        {
            test.call(this, runNext);
        }
        catch (err)
        {
            FBTest.exception("runTestSuite", err);
        }
    }, delay);
};

// ********************************************************************************************* //
// Helper Shortcuts

try
{
    window.FW = FBTest.FirebugWindow;   // Set by test harness
    window.basePath = FBTest.getHTTPURLBase();
    window.baseLocalPath = FBTest.getLocalURLBase();
}
catch (e)
{
    FBTrace.sysout("FBTest; EXCEPTION " + e, e);
}

// ********************************************************************************************* //
}).apply(FBTest);
