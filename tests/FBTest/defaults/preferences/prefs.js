pref("extensions.fbtest.showPass", true);
pref("extensions.fbtest.showFail", true);
pref("extensions.fbtest.testTimeout", 10000);      // Break timeout for stuck unit tests, 0 == disabled. [10 sec by default]
pref("extensions.fbtest.defaultTestSuite", "");
pref("extensions.fbtest.defaultTestCaseServer", "");
pref("extensions.fbtest.defaultTestDriverServer", "");
pref("extensions.fbtest.defaultLogDir", "");
pref("extensions.fbtest.haltOnFailedTest", false);
pref("extensions.fbtest.noTestTimeout", false);
pref("extensions.firebug.alwaysOpenTestConsole", false); //xxxHonza: set by Firebug, but must not be part of Firebug branch
pref("extensions.fbtest.randomTestSelection", false);
pref("extensions.fbtest.history", "");
pref("extensions.fbtest.testCaseHistory", "https://getfirebug.com/tests/content/");
pref("extensions.fbtest.testDriverHistory", "");
pref("extensions.fbtest.enableTestLogger", false);
pref("extensions.fbtest.runMoreTimes", 10);     // Specifies number of times a test should run (used for 'Run %S Times' context menu item)
pref("extensions.fbtest.scrollCurrentTestIntoView", true); // Specifies whether the currently executed test case should be scrolled into view

// Default browser window (with Firebug) size & position
pref("extensions.fbtest.defaultOuterWidth", 1024);
pref("extensions.fbtest.defaultOuterHeight", 768);
pref("extensions.fbtest.defaultScreenX", 0);
pref("extensions.fbtest.defaultScreenY", 0);


// Support for tracing console
pref("extensions.firebug.DBG_FBTEST", false);            // Tracing from FBTest internal framework.
pref("extensions.firebug.DBG_TESTCASE", false);          // Tracing from actual unit-test files.
pref("extensions.firebug.DBG_TESTCASE_MUTATION", false); // Tracing from unit-test files related to MutationRecognizer.

// Support for shortcuts
pref("extensions.firebug.key.shortcut.openTestConsole", "shift t");

// Database URL for manual test result upload
// Use iriscouch.com domain instead couchone.com to get valid certificate.
// Due to "Mixed Content Blocking" feature introduced in Firefox 23 the
// database XHR must use https (since perch on getfirebug.com uses https).
pref("extensions.fbtest.databaseURL", "https://firebug.iriscouch.com/");  // Must end with slash
pref("extensions.fbtest.databaseName", "firebug4");                       // Must *not* end with slash
