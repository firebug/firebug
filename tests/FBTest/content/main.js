/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Modules

// Must be global within the browser window.
var gFindBar;

// Share Firebug config just like any other Firebug extension
var config = Firebug.getModuleLoaderConfig();

// Register new path shortcut.
config.paths["fbtest"] = "chrome://fbtest/content";

// Load the application
require(config,
[
    "firebug/chrome/chrome",
    "firebug/lib/options",
    "firebug/lib/xpcom",
    "firebug/firebug",
    "firebug/trace/traceModule",
    "firebug/chrome/reps",
    "fbtest/testCore",
    "fbtest/testResult",
    "fbtest/testException",
    "fbtest/groupListRep",
    "fbtest/testGroup",
    "fbtest/test",
    "fbtest/testSummary",
    "fbtest/testRunner",
    "fbtest/preferences",
    "fbtest/selectionController",
    "fbtest/testConsole",
    "fbtest/testCouchUploader",
    "fbtest/notify",
],
function (ChromeFactory, Options, XPCOM, Firebug)
{
    if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        FBTrace.sysout("FBTrace; main.js require!\n");

    Firebug.Options.initialize("extensions.firebug");
    Firebug.TraceModule.initialize();

    var chrome = ChromeFactory.createFirebugChrome(window);
    chrome.initialize();
});

// ********************************************************************************************* //
