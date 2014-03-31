/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/array",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/http",
    "firebug/lib/url",
    "firebug/lib/css",
    "fbtest/testResultRep",
    "fbtest/testListRep",
    "fbtest/testProgress",
],
function(FBTrace, Locale, Arr, Events, Dom, Obj, Str, Http, Url, Css,
    TestResultRep, TestList, TestProgress) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //
// TestRunner

/**
 * Test runner is intended to run single tests or test suites.
 *
 * @class
 */
FBTestApp.TestRunner = Obj.extend(new Firebug.Listener(),
/** @lends FBTestApp.TestRunner */
{
    testQueue: null,
    onFinishCallback: null,
    testTimeoutID: null,

    runTests: function(tests, onFinishCallback)
    {
        // Filter out disabled tests
        var temp = [];
        for (var i=0; i<tests.length; i++)
        {
            if (!tests[i].disabled)
                temp.push(tests[i]);
        }
        tests = temp;

        // Bail out if there is nothing to run.
        if (!tests.length)
            return;

        // Get current URLs from the UI. The user could change it after
        // the test has been loaded.
        FBTestApp.TestConsole.updatePaths();

        // Update history
        // xxxHonza: all related components should be registered as listeners.
        FBTestApp.TestConsole.appendToHistory(null,
            FBTestApp.TestConsole.testCasePath,
            FBTestApp.TestConsole.driverBaseURI);

        tests = Arr.cloneArray(tests);

        FBTestApp.Preferences.save();
        FBTestApp.TestSummary.clear();
        TestProgress.start(tests.length);

        this.startTime = (new Date()).getTime();
        this.testCount = tests.length;
        this.testQueue = tests;
        this.onFinishCallback = onFinishCallback;

        Events.dispatch(this.fbListeners, "onTestSuiteStart", [tests]);

        this.runTest(this.getNextTest());
    },

    runTest: function(testObj)
    {
        if (!testObj)
        {
            if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERROR)
                FBTrace.sysout("fbtest.TestRunner.runTest; ERROR nothing to run!");
            return;
        }

        if (this.currentTest)
        {
            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("fbtest.TestRunner.runTest; there is already a running test!",
                    this.currentTest);
            return;
        }

        try
        {
            // Remember the current test.
            this.currentTest = testObj;

            // Show the test within the UI (expand parent group)
            var parentGroup = this.currentTest.group;
            FBTestApp.GroupList.expandGroup(parentGroup.row);

            var testRow = this.currentTest.row;
            if (FBTrace.DBG_FBTEST && !testRow)
            {
                FBTrace.sysout("fbtest.TestRunner.runTest; "+
                    "The test doesn't have a UI representation.");
            }

            var scrollCurrentTestIntoView = Firebug.getPref(FBTestApp.prefDomain,
                "scrollCurrentTestIntoView");

            if (scrollCurrentTestIntoView)
            {
                if (FBTestApp.TestConsole.randomTestSelection)
                {
                    setTimeout(function()
                    {
                        Dom.scrollIntoCenterView(testRow, null, true);
                    }, 500);
                }
                else if (this.shouldScroll(testRow))
                {
                    Dom.scrollIntoCenterView(testRow, null, true);
                }
            }

            // Start the test after the parent group is expanded so the row
            // exists and can reflect the UI state.
            this.currentTest.onStartTest(this.currentTest.driverBaseURI);

            Events.dispatch(this.fbListeners, "onTestStart", [this.currentTest]);

            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("fbtest.TestRunner.Test START: " + this.currentTest.path,
                    this.currentTest);

            // Load the test file the test frame and execute it.
            this.loadTestFrame(this.currentTest);
        }
        catch (e)
        {
            if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERRORS)
                FBTrace.sysout("fbtest.TestRunner.runTest EXCEPTION", e);

            FBTestApp.FBTest.ok(false, "TestRunner.runTest FAILS: "+e);
        }
    },

    testDone: function(canceled, test)
    {
        // Test is finished after a timeout so, any event handlers from within the
        // test can finish (see testDoneOnDelay below).
        // If the "Stop" button is pressed during the timeout we can safely ignore it.
        if (this.testDoneInProgress)
        {
            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("fbtest.TestRunner.testDone: test done already in progress");
            return;
        }

        this.testDoneInProgress = true;

        // testDone maybe called in an event handler which may need to complete before we clean up
        var self = this;
        setTimeout(function delayTestDone()
        {
            self.testDoneInProgress = false;
            self.testDoneOnDelay.apply(self, [canceled, test]);
        });

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.TestRunner.testDone: " +
                (this.currentTest ? this.currentTest.path : "NO CURRENT TEST"), this.currentTest);
    },

    testDoneOnDelay: function(canceled, test)
    {
        if (this.currentTest)
        {
            if (FBTrace.DBG_FBTEST)
            {
                FBTrace.sysout("fbtest.TestRunner.testDoneOnDelay",
                    {canceled: canceled, test: test, currentTest: this.currentTest});
            }

            // xxxpedro if the "test" parameter is different than "this.currentTest" it means that
            // FBTest.testDone() was already called for this particular test, so we must skip it
            // otherwise we will stop the next test before it gets a chance to start. For more
            // info see Issue 4923: http://code.google.com/p/fbug/issues/detail?id=4923
            if (!canceled && test && this.currentTest != test)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("fbtest.TestRunner.testDoneOnDelay: "+
                        "ERROR testDone called twice! " + this.currentTest.path,
                        {currentTest: this.currentTest, test: test});
                }
                return;
            }

            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("fbtest.TestRunner.Test END: " + this.currentTest.path,
                    this.currentTest);

            // Update summary in the status bar.
            FBTestApp.TestSummary.append(this.currentTest);

            this.currentTest.end = this.currentTest.isManual ? this.currentTest.end :
                (new Date()).getTime();
            this.currentTest.onTestDone();

            Events.dispatch(this.fbListeners, "onTestDone", [this.currentTest]);

            this.currentTest = null;
        }

        if (FBTrace.DBG_FBTEST && canceled)
            FBTrace.sysout("fbtest.TestRunner.CANCELED");

        // Test is done so, clear the break-timeout.
        // xxxHonza: all related components should be registered as listeners.
        FBTestApp.TestRunner.cleanUp();

        // If there are tests in the queue, execute them.
        if (this.testQueue && this.testQueue.length)
        {
            // Update progress bar in the status bar.
            TestProgress.update(this.testQueue.length);

            // Run next test
            this.runTest(this.getNextTest());
            return;
        }

        // Otherwise the test-suite (could be also a single test) is finished.
        TestProgress.stop();

        // Show elapsed time when running more than one test (entire suite or group of tests).
        if (this.startTime)
        {
            this.endTime = (new Date()).getTime();
            var elapsedTime = this.endTime - this.startTime;
            var message = "Elapsed Time: " + Str.formatTime(elapsedTime) +
                " (" + this.testCount + " test cases)";
            this.startTime = null;

            FBTestApp.TestSummary.setMessage(message);

            try
            {
                // xxxHonza: I have seen an exception here.
                // FBTestApp.FBTest.sysout is not a function
                FBTestApp.FBTest.sysout("FBTest Suite Finished: " + message);
            }
            catch (e)
            {
                if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERROR)
                    FBTrace.sysout("fbtest.TestRunner.testDoneOnDelay; EXCEPTION " + e, e);
            }
        }

        // Preferences could be changed by tests so restore the previous values.
        FBTestApp.Preferences.restore();

        Events.dispatch(this.fbListeners, "onTestSuiteDone", [canceled]);

        // Execute callback to notify about finished test suit (used e.g. for
        // Firefox shutdown if test suite is executed from the command line).
        if (this.onFinishCallback)
            this.onFinishCallback(canceled);
        this.onFinishCallback = null;
    },

    getNextTest: function()
    {
        var randomSelection = Firebug.getPref(FBTestApp.prefDomain, "randomTestSelection");
        if (randomSelection)
        {
            var index = (Math.floor(Math.random() * this.testQueue.length));
            return this.testQueue.splice(index, 1)[0];
        }

        return this.testQueue.shift();
    },

    loadTestFrame: function(test)
    {
        if (!this.browser)
        {
            this.browser = Firebug.chrome.$("testFrame");  // browser in testConsole

            // Hook the load event to run the test in the frameProgressListener
            this.browser.addProgressListener(this.frameProgressListener,
                Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);

            // we don't remove the progress listener
            FBTestApp.TestRunner.defaultTestTimeout = FBTestApp.TestRunner.getDefaultTestTimeout();
        }

        FBTestApp.TestRunner.loadAndRun = Obj.bind(FBTestApp.TestRunner.onLoadTestFrame,
            FBTestApp.TestRunner, test);

        var testURL = test.path;
        if (/\.js$/.test(testURL))  // then the js needs a wrapper
        {
            // a data url with script tags for FBTestFirebug.js and the test.path
            testURL = this.wrapJS(test);

            // Load the empty test frame
            this.browser.loadURI(testURL);
        }
        else
        {
            // Load the empty test frame
            this.browser.loadURI(testURL);
        }
    },

    frameProgressListener: Obj.extend(Http.BaseProgressListener,
    {
        onStateChange: function(progress, request, flag, status)
        {
            if (safeGetName(request) === "about:blank")
                return;

            if (flag & Ci.nsIWebProgressListener.STATE_IS_DOCUMENT &&
                flag & Ci.nsIWebProgressListener.STATE_TRANSFERRING)
            {
                var win = progress.DOMWindow;

                if (FBTestApp.TestRunner.eventListener)
                {
                    try
                    {
                        FBTestApp.TestRunner.win.removeEventListener("load",
                            FBTestApp.TestRunner.eventListener, true);
                    }
                    catch(e)
                    {
                        // I don't understand why we get here
                    }
                }

                FBTestApp.TestRunner.eventListener = FBTestApp.TestRunner.loadAndRun;
                FBTestApp.TestRunner.win = win;

                // Inject FBTest object into the test page before we get to the script tag compiles.
                win.FBTest = FBTestApp.FBTest;
                win.FBTestApp = FBTestApp;
                win.FBTrace = FBTrace;

                win.addEventListener("load", FBTestApp.TestRunner.eventListener, true);

                if (FBTrace.DBG_FBTEST)
                {
                    FBTrace.sysout("-> frameProgressListener.onStateChanged set load handler for: "+
                        safeGetName(request)+", win: "+progress.DOMWindow.location.href+ " "+
                        Http.getStateDescription(flag));
                }
            }
        }
    }),

    onUnloadTestFrame: function(event)
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("onUnloadTestFrame ", event);

        var testFrame = Firebug.chrome.$("testFrame");
        var outerWindow =  testFrame.contentWindow;

        FBTestApp.TestRunner.win.removeEventListener("load",
            FBTestApp.TestRunner.eventListener, true);

        delete FBTestApp.TestRunner.eventListener;

        FBTestApp.TestRunner.win.removeEventListener("unload",
            FBTestApp.TestRunner.onUnloadTestFrame, true);
    },

    getDefaultTestTimeout: function()
    {
        return Firebug.getPref(FBTestApp.prefDomain, "testTimeout");
    },

    /**
     * Called by the 'load' event handler set in the onStateChange for nsIProgressListener
     */
    onLoadTestFrame: function(event, test)
    {
        var testURL = test.path;
        var testTitle = test.desc;

        if (FBTrace.DBG_FBTEST)
        {
            FBTrace.sysout("FBTest.onLoadTestFrame; url: "+testURL+" win: " +
                FBTestApp.TestRunner.win+" wrapped: "+FBTestApp.TestRunner.win.wrappedJSObject);
        }

        var win = FBTestApp.TestRunner.win;
        if (win.wrappedJSObject)
            win = win.wrappedJSObject;

        var testDoc = win.document;
        testDoc.title = testTitle;
        var title = win.document.getElementById("testTitle");
        if (title)
            title.innerHTML = testTitle;

        // Hook the unload to clean up
        FBTestApp.TestRunner.win.addEventListener("unload",
            FBTestApp.TestRunner.onUnloadTestFrame, true);

        // Execute a "runTest" method, that must be implemented within the test driver.
        FBTestApp.TestRunner.runTestCase(win);
    },

    shouldScroll: function(element)
    {
        if (!element)
            return false;

        try
        {
            var scrollBox = Dom.getOverflowParent(element);
            if (!scrollBox)
                return false;

            var offset = Dom.getClientOffset(element);

            var scrollBottom = scrollBox.scrollTop + scrollBox.clientHeight;
            var topLine = scrollBottom - (2 * element.clientHeight);
            var bottomLine = scrollBottom + (2 * element.clientHeight);

            // If the visual representation of the test (the test row) is close to the bottom
            // side of the window or just behind it, return true.
            if (offset.y > topLine && offset.y + element.clientHeight < bottomLine)
                return true;

            return false;
        }
        catch (e)
        {
            if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERRORS)
                FBTrace.sysout("fbtest.TestRunner.shouldScroll EXCEPTION " + e, e);
        }
    },

    appendScriptTag: function(doc, srcURL)
    {
        var scriptTag = doc.createElementNS("http://www.w3.org/1999/xhtml", "script");
        scriptTag.setAttribute("src", srcURL);
        var body = doc.getElementsByTagName("body")[0];
        body.appendChild(scriptTag);
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("FBTest.appendScriptTag "+srcURL, doc);
    },

    runTestCase: function(win)
    {
        // Start timeout that breaks stuck tests.
        FBTestApp.TestRunner.setTestTimeout(win);

        if (!FBTestApp.TestRunner.currentTest)
        {
            FBTrace.sysout("FBTest.runTestCase; ERROR no currentTest!");
            return;
        }

        var currentTest = FBTestApp.TestRunner.currentTest;

        // Initialize start time.
        currentTest.start = (new Date()).getTime();

        try
        {
            // Initialize test environment.
            win.FBTest.setToKnownState(function()
            {
                win.FBTest.testStart(currentTest);

                // Execute test's entry point.
                if (win.runTest)
                    win.runTest();
                else
                    throw new Error("FBTest: no runTest() function in " + win.location);
            });
        }
        catch (exc)
        {
            FBTestApp.FBTest.sysout("runTest FAILS " + exc, exc);
            FBTestApp.FBTest.ok(false, "runTest FAILS " + exc);
            FBTestApp.TestRunner.cleanUp();

            FBTestApp.TestRunner.testDone(true);
        }

        // If we don't get an exception the test should call testDone() or the
        // testTimeout will fire
    },

    cleanUp: function()
    {
        try
        {
            FBTestApp.TestRunner.clearTestTimeout();

            // Clean-up test environment.
            // Done already in FBTest.testDone()
            //FBTestApp.FBTest.setToKnownState();

            // Since the test finished, the test frame must be set to about:blank so,
            // the current test window is unloaded and proper clean up code executed
            // (e.g. registered MutationRecognizers)
            Firebug.chrome.$("testFrame").contentWindow.location = "about:blank";
        }
        catch (e)
        {
            FBTrace.sysout("testRunner.cleanUp FAILS " + e, e);
        }
    },

    setTestTimeout: function(win)
    {
        if (this.testTimeoutID)
            this.clearTestTimeout();

        if (FBTestApp.TestConsole.noTestTimeout)
            return;

        FBTestApp.FBTest.testTimeout = FBTestApp.TestRunner.defaultTestTimeout;
        // Use test timeout from the test driver window if any. This is how
        // a test can override the default value.
        if (win && typeof(win.FBTestTimeout) != "undefined")
            FBTestApp.FBTest.testTimeout = win.FBTestTimeout;

        this.testTimeoutID = window.setTimeout(function()
        {
            var time = Str.formatTime(FBTestApp.FBTest.testTimeout);
            FBTestApp.FBTest.ok(false, "TIMEOUT: " + time );

            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("fbtest.testTimeout TEST FAILED (timeout: " + time + "): " +
                    FBTestApp.TestRunner.currentTest.path);

           FBTestApp.TestRunner.testDone(false);
        }, FBTestApp.FBTest.testTimeout);

        if (FBTrace.DBG_FBTEST)
        {
            FBTrace.sysout("TestRunner set timeout=" + FBTestApp.FBTest.testTimeout +
                " testTimeoutID " + this.testTimeoutID);
        }
    },

    clearTestTimeout: function()
    {
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("TestRunner clear testTimeoutID " + this.testTimeoutID);

        if (this.testTimeoutID)
        {
            clearTimeout(this.testTimeoutID);
            this.testTimeoutID = 0;
        }
    },

    wrapJS: function(test)
    {
        var wrapperURL = "chrome://fbtest/content/wrapAJSFile.html";
        if (!this.wrapAJSFile)
            this.wrapAJSFile = Http.getResource(wrapperURL);

        var scriptIncludes = test.testIncludes.map(function(src)
        {
            src = test.driverBaseURI + src;
            return "<script type=\"application/x-javascript\" src=\"" + src + "\"></script>";
        });

        var wrapAJSFile = new String(this.wrapAJSFile);
        var temp = wrapAJSFile.replace("__TestIncludeURLs__",
            scriptIncludes.join("")).replace("__TestDriverURL__", test.path);

        var testURL = Url.getDataURLForContent(temp, wrapperURL);
        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("wrapJS converted " + test.path, unescape(testURL));

        return testURL;
    },

    appendResult: function(result)
    {
        if (!this.currentTest)
        {
            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("test result came in after testDone!", result);

            Firebug.chrome.$("progressMessage").value = "test result came in after testDone!";
            FBTestApp.TestRunner.cleanUp();
            return;
        }

        // Append result into the test object.
        this.currentTest.appendResult(result);

        // If the test is currently opened, append the result directly into the UI.
        if (Css.hasClass(this.currentTest.row, "opened"))
        {
            var infoBodyRow = this.currentTest.row.nextSibling;
            var table = Dom.getElementByClass(infoBodyRow, "testResultTable");
            if (!table)
                table = TestResultRep.tableTag.replace({}, infoBodyRow.firstChild);

            var tbody = table.firstChild;
            result.row = TestResultRep.resultTag.insertRows(
                {results: [result]}, tbody.lastChild ? tbody.lastChild : tbody)[0];
        }
    },

    sysout: function(msg, obj)
    {
        FBTrace.sysout(msg, obj);
    }
});

// ********************************************************************************************* //
// Helpers

function safeGetName(request)
{
    try
    {
        return request.name;
    }
    catch (exc)
    {
        return null;
    }
}

// ********************************************************************************************* //
// Registration

return FBTestApp.TestRunner;

// ********************************************************************************************* //
});
